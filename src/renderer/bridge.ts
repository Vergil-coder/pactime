import { storageKeys } from '../shared/compatibility';
import { dayKey, LimitEngine } from '../core/engine';
import { demoState, DemoProcesses } from '../core/demo';
import type { AppBridge, AppSnapshot, RuleInput, RulePatch, StoredState } from '../core/types';
import { TestToolsGate } from '../core/test-tools';
import { getLanguagePreference, setLanguagePreference, validLanguagePreference, type LanguagePreference } from '../shared/i18n';

type DesktopBridge = AppBridge & { dismissReminder(): Promise<void> };
// The old property remains an alias for integrations using earlier builds.
declare global { interface Window { pactime?: DesktopBridge; yuliang?: DesktopBridge } }

class BrowserDemo implements AppBridge {
  private engine: LimitEngine;
  private processes = new DemoProcesses(Date.now() - 60_000);
  private offset = 0;
  private listeners = new Set<(snapshot: AppSnapshot) => void>();
  private message = '体验模式，不会读取或关闭真实应用。';
  private testTools = new TestToolsGate();
  private reminderPopup = true;
  constructor() {
    let language: LanguagePreference = 'system';
    try { language = validLanguagePreference(localStorage.getItem('pactime-demo-language')); } catch { /* Use the system language when preview storage is unavailable. */ }
    setLanguagePreference(language, navigator.language);
    let stored: StoredState | undefined;
    try { const raw = localStorage.getItem(storageKeys.demoState); if (raw) { const value = JSON.parse(raw); if (value.version === 1 && Array.isArray(value.rules) && value.usage) stored = value; } } catch { /* Demo state only; real desktop validates and recovers its store. */ }
    try { this.reminderPopup = localStorage.getItem(storageKeys.demoReminderPopup) !== 'false'; } catch { /* Preview preference defaults to enabled. */ }
    this.engine = new LimitEngine(stored ?? demoState(Date.now()));
    this.offset = Math.max(0, this.engine.state.latestTime - Date.now());
    for (const rule of this.engine.state.rules) this.processes.register(rule.path, rule.name);
    // Reloading a browser preview is not an exit/relaunch of its simulated target.
    if (stored) this.processes.restoreSessions(Object.values(stored.tracked ?? {}).flat());
    setInterval(() => this.tick(1), 1000);
    this.tick(0);
  }
  private now(): number { return Date.now() + this.offset; }
  private tick(seconds: number): void {
    const result = this.engine.tick({ now: this.now(), elapsedSeconds: seconds, processes: this.processes.capture() });
    this.processes.stopPids(result.kill.map(p => p.pid));
    try { localStorage.setItem(storageKeys.demoState, JSON.stringify(this.engine.state)); } catch { this.message = '体验数据无法保存，请检查浏览器本地存储。'; }
    for (const listener of this.listeners) listener(this.snapshot());
  }
  private snapshot(): AppSnapshot {
    const now = Math.max(this.now(), this.engine.state.latestTime);
    return { mode: 'demo', language: getLanguagePreference(), systemLocale: navigator.language, now, date: dayKey(now), rules: this.engine.views(this.processes.capture()), events: [...this.engine.state.events].reverse(), history: [...this.engine.state.history].reverse(), health: { monitoring: true, message: this.message, lastSampleAt: now }, startAtLogin: false, dataDirectory: '浏览器体验数据 · 与正式桌面版隔离', testToolsUnlocked: this.testTools.unlocked, reminderPopup: this.reminderPopup };
  }
  private change(action: () => void): void {
    const before = structuredClone(this.engine.state);
    try { action(); localStorage.setItem(storageKeys.demoState, JSON.stringify(this.engine.state)); }
    catch (error) { this.engine = new LimitEngine(before); throw error; }
    this.tick(0);
  }
  async getSnapshot(): Promise<AppSnapshot> { return this.snapshot(); }
  async setLanguage(value: LanguagePreference): Promise<void> {
    const language = validLanguagePreference(value);
    localStorage.setItem('pactime-demo-language', language);
    setLanguagePreference(language, navigator.language);
    for (const listener of this.listeners) listener(this.snapshot());
  }
  subscribe(listener: (snapshot: AppSnapshot) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  async listProcesses() { return this.processes.list(); }
  async chooseExecutable(): Promise<null> { return null; }
  async resolveDroppedFile(): Promise<never> { throw new Error('浏览器体验模式不能读取本机文件。请在桌面版中拖入应用。'); }
  async setReminderAudio(): Promise<void> {}
  async setReminderPopup(enabled: boolean): Promise<void> {
    localStorage.setItem(storageKeys.demoReminderPopup, String(enabled));
    this.reminderPopup = enabled;
    for (const listener of this.listeners) listener(this.snapshot());
  }
  async testReminderAudio(): Promise<void> {}
  async restartElevated(): Promise<never> { throw new Error('请在 Windows 安装版中使用管理员启动。'); }
  async tapTestTools(): Promise<boolean> { return this.testTools.tap(); }
  async resetTestData(): Promise<void> {
    if (!this.testTools.unlocked) throw new Error('测试工具尚未启用。');
    const fresh = new LimitEngine(); fresh.state.latestTime = Date.now();
    localStorage.setItem(storageKeys.demoState, JSON.stringify(fresh.state));
    this.engine = fresh; this.offset = 0; this.processes = new DemoProcesses(Date.now() - 60_000);
    this.message = '体验模式，不会读取或关闭真实应用。';
    for (const listener of this.listeners) listener(this.snapshot());
  }
  async addRule(input: RuleInput): Promise<void> { this.change(() => this.engine.addRule(input, this.now())); this.processes.register(input.path, input.name); }
  async changeRule(id: string, patch: RulePatch): Promise<void> { this.change(() => this.engine.changeRule(id, patch, this.now())); }
  async removeRule(id: string): Promise<void> { this.change(() => this.engine.removeRule(id, this.now())); }
  async showMainWindow(): Promise<void> {}
  async setAppearance(): Promise<void> {}
  async setStartAtLogin(): Promise<void> { throw new Error('体验模式不修改系统开机设置。'); }
  async revealData(): Promise<void> { this.message = '体验数据保存在本浏览器；Windows版使用本机应用数据文件夹。'; this.tick(0); }
  async demoAdvance(seconds: number): Promise<void> { this.offset += seconds * 1000; this.tick(seconds >= 86400 ? 0 : seconds); }
  async demoSetRunning(path: string, running: boolean): Promise<void> { this.processes.setRunning(path, running); this.tick(0); }
}

export const desktopBridge = window.pactime ?? window.yuliang;
export const bridge: AppBridge = desktopBridge ?? new BrowserDemo();
