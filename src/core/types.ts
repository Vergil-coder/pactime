import type { LanguagePreference } from '../shared/i18n';
export type Phase = 'ready' | 'grace' | 'blocked';
export interface ProcessInfo { pid: number; parentPid: number; name: string; path: string; startedAt: number; icon?: string; displayName?: string; windowTitle?: string }
export interface SelectedApplication { path: string; name: string; note?: string }
export type ProcessIdentity = Pick<ProcessInfo, 'pid' | 'path' | 'startedAt'>;
export interface PendingChange { effectiveDay: string; limitSeconds?: number; graceSeconds?: number; includeChildren?: boolean; delete?: boolean }
export interface Rule { id: string; name: string; path: string; limitSeconds: number; graceSeconds: number; includeChildren: boolean; createdAt: number; pending?: PendingChange }
export interface Usage { day: string; usedSeconds: number; phase: Phase; graceDeadline?: number; graceStartedAt?: number; warned: string[] }
export interface LimitEvent { id: string; at: number; ruleId?: string; kind: 'warning' | 'grace' | 'blocked' | 'attempt' | 'change' | 'reset' | 'error'; title: string; message: string }
export interface HistoryEntry { day: string; ruleId: string; name: string; usedSeconds: number; limitSeconds: number }
export interface StoredState { version: 1; latestTime: number; rules: Rule[]; usage: Record<string, Usage>; tracked: Record<string, ProcessIdentity[]>; events: LimitEvent[]; history: HistoryEntry[] }
export interface RuleInput { name: string; path: string; limitSeconds: number; graceSeconds?: number; includeChildren: boolean }
export type RulePatch = Partial<Pick<RuleInput, 'name' | 'limitSeconds' | 'graceSeconds' | 'includeChildren'>>;
export interface RuleView extends Rule { usedSeconds: number; remainingSeconds: number; phase: Phase; graceDeadline?: number; running: boolean; processCount: number }
export interface TickInput { now: number; elapsedSeconds: number; processes: ProcessInfo[]; awake?: boolean; unavailablePaths?: string[] }
export type ReminderAudioMode = 'voice' | 'soft' | 'sound' | 'off';
export interface TickResult { kill: ProcessIdentity[]; alerts: LimitEvent[] }
export interface AppSnapshot {
  language?: LanguagePreference; systemLocale?: string;
  mode: 'windows' | 'macos' | 'demo'; now: number; date: string; rules: RuleView[]; events: LimitEvent[]; history: HistoryEntry[];
  health: { monitoring: boolean; message: string; lastSampleAt?: number; needsElevation?: boolean }; startAtLogin: boolean; dataDirectory: string;
  icons?: Record<string, string>; reminderEventId?: string;
  startupMode?: 'development' | 'test' | 'normal'; startupError?: string;
  reminderAudio?: ReminderAudioMode; reminderPopup?: boolean; audioError?: string; windowsPrivilege?: 'standard' | 'administrator' | 'unknown'; canRestartElevated?: boolean; windowsQueryError?: string;
  testToolsUnlocked?: boolean;
}
export interface AppBridge {
  setLanguage(value: LanguagePreference): Promise<void>;
  getSnapshot(): Promise<AppSnapshot>; subscribe(listener: (snapshot: AppSnapshot) => void): () => void;
  listProcesses(): Promise<ProcessInfo[]>; chooseExecutable(): Promise<SelectedApplication | null>;
  resolveDroppedFile(file: File): Promise<SelectedApplication>;
  setReminderAudio(mode: ReminderAudioMode): Promise<void>; testReminderAudio(): Promise<void>; restartElevated(): Promise<void>;
  setReminderPopup(enabled: boolean): Promise<void>;
  tapTestTools(): Promise<boolean>; resetTestData(): Promise<void>;
  addRule(input: RuleInput): Promise<void>; changeRule(id: string, patch: RulePatch): Promise<void>; removeRule(id: string): Promise<void>;
  showMainWindow(): Promise<void>;
  setAppearance(value: 'light' | 'dark' | 'system'): Promise<void>;
  setStartAtLogin(value: boolean): Promise<void>; revealData(): Promise<void>;
  demoAdvance(seconds: number): Promise<void>; demoSetRunning(path: string, running: boolean): Promise<void>;
}
