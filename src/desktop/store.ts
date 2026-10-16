import type { StoredState } from '../core/types';
import { mkdir, readFile, writeFile, rename, copyFile, open } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

const identity = z.object({ pid: z.number().int().positive(), path: z.string(), startedAt: z.number().nonnegative() });
const stateSchema = z.object({
  version: z.literal(1), latestTime: z.number().nonnegative(),
  rules: z.array(z.object({ id: z.string(), name: z.string(), path: z.string(), limitSeconds: z.number().int().min(1).max(86400), graceSeconds: z.number().int().min(0).max(1800).default(1200), includeChildren: z.boolean(), createdAt: z.number(), pending: z.object({ effectiveDay: z.string(), limitSeconds: z.number().int().min(1).max(86400).optional(), graceSeconds: z.number().int().min(0).max(1800).optional(), includeChildren: z.boolean().optional(), delete: z.boolean().optional() }).optional() })),
  usage: z.record(z.string(), z.object({ day: z.string(), usedSeconds: z.number().nonnegative(), phase: z.enum(['ready', 'grace', 'blocked']), graceDeadline: z.number().optional(), graceStartedAt: z.number().optional(), warned: z.array(z.string()) })),
  tracked: z.record(z.string(), z.array(identity)),
  events: z.array(z.object({ id: z.string(), at: z.number(), ruleId: z.string().optional(), kind: z.enum(['warning', 'grace', 'blocked', 'attempt', 'change', 'reset', 'error']), title: z.string(), message: z.string() })),
  history: z.array(z.object({ day: z.string(), ruleId: z.string(), name: z.string(), usedSeconds: z.number().nonnegative(), limitSeconds: z.number() }))
});

export class AtomicStateStore {
  recovered = false;
  constructor(readonly directory: string) {}
  async load(): Promise<StoredState | null> {
    let mainMissing = false;
    try { return stateSchema.parse(JSON.parse(await readFile(join(this.directory, 'state.json'), 'utf8'))); }
    catch (error) { mainMissing = (error as NodeJS.ErrnoException).code === 'ENOENT'; }
    try { const state = stateSchema.parse(JSON.parse(await readFile(join(this.directory, 'state.backup.json'), 'utf8'))); this.recovered = true; return state; }
    catch (error) {
      if (mainMissing && (error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new Error('本地规则文件损坏或无法读取，且没有可恢复的备份。请保留数据文件并检查访问权限。');
    }
  }
  async write(state: StoredState): Promise<void> {
    stateSchema.parse(state);
    await mkdir(this.directory, { recursive: true });
    const main = join(this.directory, 'state.json'); const temp = join(this.directory, 'state.next.json');
    await writeFile(temp, JSON.stringify(state), { mode: 0o600 });
    const handle = await open(temp, 'r+'); try { await handle.sync(); } finally { await handle.close(); }
    // Never replace a good backup with a known-corrupt primary file.
    try { stateSchema.parse(JSON.parse(await readFile(main, 'utf8'))); await copyFile(main, join(this.directory, 'state.backup.json')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && !(error instanceof SyntaxError) && !(error instanceof z.ZodError)) throw error; }
    await rename(temp, main);
  }
  async resetForTesting(state: StoredState): Promise<void> {
    // Replace both durable copies, so recovery cannot resurrect pre-reset rules.
    await this.write(state); await this.write(state);
  }
}
