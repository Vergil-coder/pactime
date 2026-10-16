import type { ProcessInfo, ProcessIdentity } from '../core/types';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
const exec = promisify(execFile);
export function validateMacTargetPath(target: string, own: string): void {
  if (!path.posix.isAbsolute(target) || target.includes('\0')) throw new Error('请选择本机应用的绝对路径。');
  const normalized = path.posix.normalize(target);
  const bundleEnd = own.indexOf('.app/');
  const ownRoot = bundleEnd >= 0 ? own.slice(0, bundleEnd + 4) : own;
  const protectedRoots = ['/System', '/usr', '/bin', '/sbin', '/Library/Apple', ownRoot];
  if (protectedRoots.some(root => normalized === root || normalized.startsWith(root + '/'))) throw new Error('不能限制系统程序或Pactime自身。');
}
export function createMacAdapter(helper: string) {
  async function call<T>(command: string, ...args: string[]): Promise<T> {
    const { stdout } = await exec(helper, [command, ...args], { timeout: 15_000, maxBuffer: 8 * 1024 * 1024 });
    return JSON.parse(stdout) as T;
  }
  return {
    capture: (): Promise<ProcessInfo[]> => call('capture'),
    resolveTarget: async (bundle: string, own: string) => {
      const selected = await call<{ path: string; name: string }>('resolve', bundle);
      validateMacTargetPath(selected.path, own); return selected;
    },
    terminate: (targets: ProcessIdentity[], own: string): Promise<string[]> => call('terminate', JSON.stringify(targets), own),
  };
}
