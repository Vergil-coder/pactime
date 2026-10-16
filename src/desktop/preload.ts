import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { AppBridge, AppSnapshot } from '../core/types';
const bridge: AppBridge & { dismissReminder(): Promise<void> } = {
  setLanguage: value => ipcRenderer.invoke('language', value),
  getSnapshot: () => ipcRenderer.invoke('snapshot'),
  subscribe: listener => { const handler = (_event: unknown, snapshot: AppSnapshot) => listener(snapshot); ipcRenderer.on('snapshot', handler); return () => ipcRenderer.removeListener('snapshot', handler); },
  listProcesses: () => ipcRenderer.invoke('processes'), chooseExecutable: () => ipcRenderer.invoke('choose-executable'),
  resolveDroppedFile: async file => {
    const path = webUtils.getPathForFile(file);
    if (!path) throw new Error('无法读取拖入文件的位置。请从桌面或文件管理器拖入应用，或使用浏览按钮选择。');
    return ipcRenderer.invoke('resolve-target', path);
  },
  setReminderAudio: mode => ipcRenderer.invoke('reminder-audio', mode), testReminderAudio: () => ipcRenderer.invoke('test-reminder-audio'), restartElevated: () => ipcRenderer.invoke('restart-elevated'),
  setReminderPopup: enabled => ipcRenderer.invoke('reminder-popup', enabled),
  tapTestTools: () => ipcRenderer.invoke('test-tools-tap'), resetTestData: () => ipcRenderer.invoke('reset-test-data'),
  addRule: input => ipcRenderer.invoke('add-rule', input), changeRule: (id, patch) => ipcRenderer.invoke('change-rule', id, patch), removeRule: id => ipcRenderer.invoke('remove-rule', id),
  showMainWindow: () => ipcRenderer.invoke('show-main-window'),
  setAppearance: value => ipcRenderer.invoke('appearance', value),
  setStartAtLogin: value => ipcRenderer.invoke('start-at-login', value), revealData: () => ipcRenderer.invoke('reveal-data'),
  demoAdvance: seconds => ipcRenderer.invoke('demo-advance', seconds), demoSetRunning: (path, running) => ipcRenderer.invoke('demo-running', path, running),
  dismissReminder: () => ipcRenderer.invoke('dismiss-reminder')
};
contextBridge.exposeInMainWorld('pactime', bridge);
// Preserve the bridge name used by earlier integrations.
contextBridge.exposeInMainWorld('yuliang', bridge);
