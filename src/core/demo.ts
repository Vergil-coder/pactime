import { LimitEngine } from './engine';
import type { ProcessIdentity, ProcessInfo, StoredState } from './types';

export const DEMO_APPS = [
  { name: 'Steam', path: 'C:\\Program Files (x86)\\Steam\\steam.exe', pid: 100 },
  { name: 'WeGame', path: 'C:\\Games\\WeGame\\wegame.exe', pid: 200 },
  { name: '视频应用', path: 'C:\\Apps\\Video\\player.exe', pid: 300 }
];

export function demoState(now: number): StoredState {
  const engine = new LimitEngine();
  for (const [index, app] of DEMO_APPS.entries()) {
    const rule = engine.addRule({ name: app.name, path: app.path, includeChildren: true, limitSeconds: index === 2 ? 60 * 60 : 120 * 60 }, now);
    engine.state.usage[rule.id].usedSeconds = [93 * 60, 42 * 60, 8 * 60][index];
  }
  engine.state.events = []; return engine.state;
}

export class DemoProcesses {
  private apps = [...DEMO_APPS];
  private running = new Set([DEMO_APPS[0].path]);
  private starts = new Map<string, number>();
  private generation = 0;
  constructor(private readonly birth: number) {}
  capture(): ProcessInfo[] {
    const processes = this.apps.filter(a => this.running.has(a.path)).map(a => ({ pid: a.pid, parentPid: 0, name: a.name, path: a.path, startedAt: this.starts.get(a.path) ?? this.birth }));
    if (this.running.has(DEMO_APPS[0].path)) processes.push({ pid: 110, parentPid: 100, name: 'steam-game.exe', path: 'C:\\Games\\SteamExample\\steam-game.exe', startedAt: (this.starts.get(DEMO_APPS[0].path) ?? this.birth) + 1 });
    return processes;
  }
  register(path: string, name: string): void { if (!this.apps.some(a => a.path === path)) this.apps.push({ name, path, pid: 400 + this.apps.length }); }
  restoreSessions(identities: ProcessIdentity[]): void {
    for (const app of this.apps) {
      const identity = identities.find(p => p.path === app.path);
      if (identity) { app.pid = identity.pid; this.starts.set(app.path, identity.startedAt); this.running.add(app.path); }
    }
  }
  setRunning(path: string, running: boolean): void {
    this.register(path, path.split('\\').at(-1) ?? '演示应用');
    if (running) { if (!this.running.has(path)) this.starts.set(path, Math.max(this.birth + ++this.generation * 1000, (this.starts.get(path) ?? this.birth) + 1000)); this.running.add(path); }
    else this.running.delete(path);
  }
  stopPids(pids: number[]): void { for (const app of this.apps) if (pids.includes(app.pid)) this.running.delete(app.path); }
  list(): ProcessInfo[] { return this.apps.map(a => ({ pid: a.pid, parentPid: 0, name: a.name, path: a.path, startedAt: this.birth })); }
}
