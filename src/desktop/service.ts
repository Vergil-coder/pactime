import type { AppSnapshot, ProcessInfo, ProcessIdentity, RuleInput, RulePatch, StoredState, LimitEvent } from '../core/types';
import { dayKey, LimitEngine } from '../core/engine';
import { demoState, DemoProcesses } from '../core/demo';
import { validateTargetPath, isWindowsAccessError } from './windows';
import { validateMacTargetPath } from './macos';
import { normalizePath } from '../core/processes';
import path from 'node:path';
export interface ServiceOptions {
  mode: AppSnapshot['mode']; directory: string; ownExecutable: string;
  storage: { load(): Promise<StoredState | null>; write(state: StoredState): Promise<void>; resetForTesting?(state: StoredState): Promise<void> };
  capture(): Promise<ProcessInfo[]>; terminate(targets: ProcessIdentity[]): Promise<string[]>;
  captureForPicker?: () => Promise<ProcessInfo[]>;
  windowsPrivilege?: AppSnapshot['windowsPrivilege'];
  now?: () => number; notify?: (events: LimitEvent[]) => void;
}
export class LimitService {
  private engine = new LimitEngine();
  private processes: ProcessInfo[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<(snapshot: AppSnapshot) => void>();
  private health: AppSnapshot['health'] = { monitoring: false, message: '正在准备监测…' };
  private previousPerformance = performance.now();
  private awake = true;
  private offset = 0;
  private simulation: DemoProcesses;
  private captureInFlight?: Promise<ProcessInfo[]>;
  private pickerCaptureInFlight?: Promise<ProcessInfo[]>;
  private savedSignature?: string;
  startAtLogin = false;
  constructor(private readonly options: ServiceOptions) { this.simulation = new DemoProcesses(this.now() - 60_000); }
  private now(): number { return (this.options.now?.() ?? Date.now()) + this.offset; }
  async initialize(): Promise<void> {
    const initial = await this.options.storage.load();
    this.engine = new LimitEngine(initial ?? (this.options.mode === 'demo' ? demoState(this.now()) : undefined));
    for (const rule of this.engine.state.rules) if (this.options.mode === 'demo') this.simulation.register(rule.path, rule.name);
    if (this.options.mode === 'demo') this.offset = Math.max(0, this.engine.state.latestTime - (this.options.now?.() ?? Date.now()));
  }
  subscribe(listener: (snapshot: AppSnapshot) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private publish(): void { const snapshot = this.snapshot(); for (const listener of this.listeners) listener(snapshot); }
  private capture(): Promise<ProcessInfo[]> {
    if (this.options.mode === 'demo') return Promise.resolve(this.simulation.capture());
    if (!this.captureInFlight) this.captureInFlight = this.options.capture().finally(() => { this.captureInFlight = undefined; });
    return this.captureInFlight;
  }
  private async persist(force = false): Promise<void> {
    const { latestTime: _clock, ...businessState } = this.engine.state;
    const signature = JSON.stringify(businessState);
    // Keep active usage, locks, identities and edits durable. Idle clock-only samples need no disk write.
    if (force || signature !== this.savedSignature) {
      await this.options.storage.write(this.engine.state); this.savedSignature = signature;
    }
  }
  private enqueue<T>(action: () => Promise<T>): Promise<T> { const result = this.queue.then(action); this.queue = result.catch(() => {}); return result; }

  private async mutate(change: () => void): Promise<void> {
    return this.enqueue(async () => {
      // Settle the old rules before an edit can rotate midnight or change the allowance.
      if (this.engine.state.rules.length) await this.collectAndEvaluate();
      const before = structuredClone(this.engine.state);
      try { change(); await this.persist(true); }
      catch (error) { this.engine = new LimitEngine(before); this.health = { ...this.health, message: `修改未保存：${(error as Error).message}` }; this.publish(); throw error; }
      await this.collectAndEvaluate(); this.publish();
    });
  }
  async addRule(input: RuleInput): Promise<void> {
    this.validatePath(input.path);
    return this.mutate(() => { this.engine.addRule(input, this.now()); });
  }
  async changeRule(id: string, patch: RulePatch): Promise<void> { return this.mutate(() => this.engine.changeRule(id, patch, this.now())); }
  async removeRule(id: string): Promise<void> { return this.mutate(() => this.engine.removeRule(id, this.now())); }
  async prepareForRestart(): Promise<void> { await this.enqueue(async () => { await this.collectAndEvaluate(); await this.persist(true); }); }
  async resetForTesting(): Promise<void> {
    await this.enqueue(async () => {
      const fresh = new LimitEngine(); fresh.state.latestTime = this.options.now?.() ?? Date.now();
      try {
        if (this.options.storage.resetForTesting) await this.options.storage.resetForTesting(fresh.state);
        else await this.options.storage.write(fresh.state);
      } catch (error) {
        // If replacing the backup failed after committing the primary, restore
        // the running state before reporting an incomplete reset.
        await this.options.storage.write(this.engine.state).catch(() => {}); throw error;
      }
      this.engine = fresh; this.processes = []; this.offset = 0;
      this.simulation = new DemoProcesses(this.now() - 60_000); this.savedSignature = undefined;
      this.previousPerformance = performance.now();
      this.health = { monitoring: true, message: '测试数据已重置。', lastSampleAt: this.now() };
      this.publish();
    });
  }

  async sample(seconds?: number): Promise<void> {
    return this.enqueue(async () => {
      await this.collectAndEvaluate(seconds); this.publish();
    });
  }
  private async collectAndEvaluate(seconds?: number): Promise<void> {
    try {
      this.processes = this.engine.state.rules.length ? await this.capture() : [];
      const performanceNow = performance.now();
      const dt = seconds ?? Math.max(0, (performanceNow - this.previousPerformance) / 1000);
      this.previousPerformance = performanceNow;
      await this.evaluate(this.awake ? dt : 0);
    } catch (error) {
      this.previousPerformance = performance.now();
      const message = (error as Error).message;
      const denied = this.options.mode === 'windows' && isWindowsAccessError(error);
      const advice = !denied ? '' : this.options.windowsPrivilege === 'administrator' ? 'Pactime 已以管理员身份运行，仍无法读取进程信息，请检查系统或进程保护限制。' : '请尝试以管理员身份重新启动 Pactime，已有规则、用时和关闭截止会保留。';
      this.health = { ...this.health, monitoring: false, needsElevation: denied && this.options.windowsPrivilege !== 'administrator', message: `监测暂不可用：${message}${advice ? `。${advice}` : ''}` };
      const notice = this.engine.recordError(this.health.message, this.now()); if (notice) this.options.notify?.([notice]);
    }
  }

  private async evaluate(seconds: number): Promise<void> {
    const problems: string[] = [];
    const unavailablePaths: string[] = [];
    let needsElevation = false;
    if (this.options.mode === 'windows') {
      for (const rule of this.engine.state.rules) {
        const name = path.win32.basename(rule.path).toLowerCase();
        if (this.processes.some(p => p.name.toLowerCase() === name && !p.path)) {
          const identified = this.processes.some(p => p.path && normalizePath(p.path) === normalizePath(rule.path));
          if (!identified) unavailablePaths.push(rule.path);
          needsElevation = this.options.windowsPrivilege !== 'administrator';
          problems.push(`无法读取 ${rule.name} 的程序路径，当前不能可靠计时或关闭。${this.options.windowsPrivilege === 'administrator' ? 'Pactime 已以管理员身份运行，目标仍可能受到系统或进程保护；当前无法保证关闭这个应用。' : '可能是权限或进程保护限制。请尝试以管理员身份重新启动 Pactime，已有规则和用时会保留。'}`);
        }
      }
    }
    const result = this.engine.tick({ now: this.now(), elapsedSeconds: seconds, processes: this.processes, awake: this.awake, unavailablePaths });
    try { await this.persist(); } catch (error) { problems.push(`本地保存失败：${(error as Error).message}。重启前请处理存储问题。`); }
    if (result.kill.length) {
      try {
        if (this.options.mode === 'demo') { this.simulation.stopPids(result.kill.map(p => p.pid)); this.processes = this.simulation.capture(); }
        else { const failures = await this.options.terminate(result.kill); problems.push(...failures); if (failures.some(isWindowsAccessError) && this.options.mode === 'windows' && this.options.windowsPrivilege !== 'administrator') needsElevation = true; }
      } catch (error) {
        const denied = this.options.mode === 'windows' && isWindowsAccessError(error);
        needsElevation ||= denied && this.options.windowsPrivilege !== 'administrator';
        const advice = !denied ? '' : this.options.windowsPrivilege === 'administrator' ? 'Pactime 已以管理员身份运行，目标仍可能受到系统或进程保护；当前无法保证关闭它。' : '如果目标使用了管理员权限，可以尝试以管理员身份重新启动 Pactime，已有规则和用时会保留。';
        problems.push(`关闭失败：${(error as Error).message}${advice ? `。${advice}` : ''}`);
      }
    }
    this.health = { monitoring: problems.length === 0, lastSampleAt: this.now(), needsElevation, message: problems.join('\n') || (this.options.mode === 'demo' ? '体验模式，不会读取或关闭真实应用。' : '正在本地监测应用，关闭主窗口后仍继续运行。') };
    if (problems.length) { const notice = this.engine.recordError(problems.join('\n'), this.now()); if (notice) result.alerts.push(notice); }
    this.options.notify?.(result.alerts);
  }

  snapshot(): AppSnapshot {
    const now = Math.max(this.now(), this.engine.state.latestTime);
    return { mode: this.options.mode, now, date: dayKey(now), rules: this.engine.views(this.processes), events: [...this.engine.state.events].reverse(), history: [...this.engine.state.history].reverse(), health: this.health, startAtLogin: this.startAtLogin, dataDirectory: this.options.directory };
  }
  private validatePath(target: string): void {
    if (this.options.mode === 'macos') validateMacTargetPath(target, this.options.ownExecutable);
    else validateTargetPath(target, this.options.ownExecutable);
  }
  async listProcesses(): Promise<ProcessInfo[]> {
    let processes: ProcessInfo[];
    if (this.options.mode !== 'demo' && this.options.captureForPicker) {
      if (!this.pickerCaptureInFlight) this.pickerCaptureInFlight = this.options.captureForPicker().finally(() => { this.pickerCaptureInFlight = undefined; });
      processes = await this.pickerCaptureInFlight;
    } else processes = this.options.mode === 'demo' ? this.simulation.list() : await this.capture();
    // Prefer the window-bearing instance when several processes share one executable.
    processes = [...processes].sort((a, b) => Number(!!b.windowTitle) - Number(!!a.windowTitle));
    const seen = new Set<string>();
    return processes.filter(p => {
      if (!p.path) {
        if (this.options.mode !== 'windows' || p.pid <= 4 || !/\.exe$/i.test(p.name) || p.name.toLowerCase() === path.win32.basename(this.options.ownExecutable).toLowerCase()) return false;
        const key = `unreadable:${p.name.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key); return true;
      }
      if (seen.has(normalizePath(p.path))) return false;
      if (this.options.mode === 'macos' && !/\.app\/Contents\/MacOS\/[^/]+$/.test(p.path)) return false;
      if (this.options.mode === 'macos' && /\.app\/Contents\/.*\.app\/Contents\//.test(p.path)) return false;
      try { this.validatePath(p.path); } catch { return false; }
      seen.add(normalizePath(p.path)); return true;
    }).sort((a, b) => Number(!!b.path) - Number(!!a.path) || Number(!!b.windowTitle) - Number(!!a.windowTitle) || (a.displayName || a.name).localeCompare(b.displayName || b.name));
  }
  setAwake(awake: boolean): void { this.awake = awake; this.previousPerformance = performance.now(); }
  async demoAdvance(seconds: number): Promise<void> {
    if (this.options.mode !== 'demo') throw new Error('真实模式不能快进或重置计时。');
    this.offset += seconds * 1000; await this.sample(seconds >= 86400 ? 0 : seconds);
  }
  async demoSetRunning(path: string, running: boolean): Promise<void> {
    if (this.options.mode !== 'demo') throw new Error('真实模式不提供模拟操作。');
    this.simulation.setRunning(path, running); await this.sample(0);
  }
}
