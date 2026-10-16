import { legacyAppId, legacyDataName, runtimeEnvironment } from '../shared/compatibility';
import { t, localize, getLanguage, getLanguagePreference, setLanguagePreference } from '../shared/i18n';
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, nativeTheme, Notification, powerMonitor, screen, shell, Tray } from 'electron';
import { join, isAbsolute } from 'node:path';
import { z } from 'zod';
import { AtomicStateStore } from './store';
import { LimitService } from './service';
import { createWindowsAdapter, resolveWindowsTarget } from './windows';
import { getWindowsPrivilege, requestWindowsElevation } from './windows-elevation';
import { ReminderAudio, playReminder } from './reminder-audio';
import { loadReminderPreferences, reminderSettingsDirectory, saveReminderSettings, type ReminderSettings } from './reminder-settings';
import { createMacAdapter } from './macos';
import { readMacAppIcon } from './macos-icon';
import type { AppSnapshot, LimitEvent } from '../core/types';
import { activeReminder } from '../core/reminders';
import { IconCache } from './icon-cache';
import { TestToolsGate } from '../core/test-tools';

let window: BrowserWindow | null = null;
let reminder: BrowserWindow | null = null;
let systemNotification: Notification | null = null;
let tray: Tray | null = null;
let service: LimitService;
let quitting = false;
let reminderEventId: string | undefined;
let ready = false;
let requestedOpen = false;
let releaseMain: ReturnType<typeof setTimeout> | undefined;
let mainVisibilityGeneration = 0;
let mainBounds: Electron.Rectangle | undefined;
let pickerInFlight: Promise<import('../core/types').ProcessInfo[]> | undefined;
let startupError: string | undefined;
let lastLoginCheck = 0;
let hadRules = false;
let windowsPrivilege: AppSnapshot['windowsPrivilege'];
let windowsQueryError: string | undefined;
let reminderAudioMode: import('../core/types').ReminderAudioMode = 'voice';
let reminderPopupEnabled = true;
let audioError: string | undefined;
let elevationInFlight = false;
let refreshTrayMenu = () => {};
let reminderSettingsQueue: Promise<void> = Promise.resolve();
const testTools = new TestToolsGate();
const runtime = runtimeEnvironment(process.env);
const demo = runtime.demo === '1' || !['win32', 'darwin'].includes(process.platform);
const mac = process.platform === 'darwin';
const macAdapter = createMacAdapter(app.isPackaged ? join(process.resourcesPath, 'process-helper') : join(app.getAppPath(), 'dist-native/process-helper'));
const devUrl = runtime.devUrl;
const development = !app.isPackaged && !!devUrl;
const systemLocale = () => app.getPreferredSystemLanguages()[0] || app.getSystemLocale();
const loginArgs = () => app.isPackaged ? ['--background'] : [app.getAppPath(), '--background'];
// Display branding can change; this root also identifies the single-instance lock.
// Keep the original storage root so existing rules, history and appearance survive.
const handedOffDirectory = process.platform === 'win32' && app.isPackaged ? process.argv.find(value => value.startsWith('--pactime-data-dir='))?.slice('--pactime-data-dir='.length) : undefined;
if (runtime.testData) app.setPath('userData', runtime.testData);
else if (handedOffDirectory && isAbsolute(handedOffDirectory)) app.setPath('userData', handedOffDirectory);
else app.setPath('userData', join(app.getPath('appData'), `${legacyDataName}${development ? '-development' : ''}`));
app.setName('Pactime');

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => showWindow());
  app.whenReady().then(boot).catch(error => { dialog.showErrorBox(t('Pactime无法启动'), t('{0}\n\n原有数据没有被清空。请检查数据文件和访问权限。', { 0: localize(error.message) })); quitting = true; app.quit(); });
}

function configureWindow(target: BrowserWindow): void {
  target.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  target.webContents.on('will-navigate', (event, url) => { if (url !== target.webContents.getURL()) event.preventDefault(); });
}
function loadView(target: BrowserWindow, isReminder = false): void {
  if (devUrl) void target.loadURL(devUrl + (isReminder ? '/#reminder' : ''));
  else void target.loadFile(join(__dirname, '../dist/index.html'), isReminder ? { hash: 'reminder' } : {});
}
function showWindow(): void {
  if (!ready) { requestedOpen = true; return; }
  mainVisibilityGeneration++;
  clearTimeout(releaseMain);
  if (!window || window.isDestroyed()) {
    const target = new BrowserWindow({ width: 930, height: 660, ...mainBounds, minWidth: 760, minHeight: 520, title: 'Pactime', icon: join(__dirname, '../assets/icon.png'), titleBarStyle: 'default', backgroundColor: '#e8e6e1', show: false, autoHideMenuBar: true, webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    window = target; configureWindow(target); loadView(target);
    target.once('ready-to-show', () => { if (!target.isDestroyed()) { target.show(); target.focus(); } });
    target.on('show', () => { mainVisibilityGeneration++; clearTimeout(releaseMain); target.webContents.send('snapshot', decorate(service.snapshot())); });
    target.on('close', event => { if (!quitting) { event.preventDefault(); target.hide(); } });
    target.on('hide', () => {
      const generation = ++mainVisibilityGeneration;
      mainBounds = target.getBounds(); clearTimeout(releaseMain);
      releaseMain = setTimeout(async () => {
        if (target.isDestroyed() || target.isVisible()) return;
        // Preserve a hidden, unsaved editor; other views can be reconstructed from local state.
        const editing = await target.webContents.executeJavaScript('Boolean(document.querySelector("dialog[open]"))').catch(() => true);
        if (!editing && generation === mainVisibilityGeneration && !target.isDestroyed() && !target.isVisible()) target.destroy();
      }, 30_000);
      releaseMain.unref();
    });
    target.on('closed', () => { if (window === target) window = null; });
    void Promise.all(service.snapshot().rules.map(rule => appIcon(rule.path))).then(() => { if (!target.isDestroyed() && target.isVisible()) target.webContents.send('snapshot', decorate(service.snapshot())); });
    return;
  }
  window.show(); if (window.isMinimized()) window.restore(); window.focus();
}
function dismissReminder(): void {
  const notification = systemNotification; systemNotification = null; notification?.close();
  const target = reminder; reminder = null; reminderEventId = undefined;
  if (target && !target.isDestroyed()) { target.hide(); setImmediate(() => { if (!target.isDestroyed()) target.destroy(); }); }
}
function decorate(snapshot: AppSnapshot): AppSnapshot {
  const selectedIcons = Object.fromEntries(snapshot.rules.flatMap(rule => { const icon = icons.cached(rule.path); return icon ? [[rule.path, icon]] : []; }));
  return { ...snapshot, language: getLanguagePreference(), systemLocale: systemLocale(), icons: selectedIcons, reminderEventId, startAtLogin: service.startAtLogin, startupMode: development ? 'development' : runtime.testData ? 'test' : 'normal', startupError, reminderAudio: demo ? 'off' : reminderAudioMode, reminderPopup: reminderPopupEnabled, audioError, windowsPrivilege, windowsQueryError, canRestartElevated: !demo && !mac && app.isPackaged && !runtime.testData && windowsPrivilege !== 'administrator', testToolsUnlocked: testTools.unlocked };
}
const icons = new IconCache(async executable => {
    if (mac) {
      const data = await readMacAppIcon(executable);
      if (data) {
        const resource = nativeImage.createFromBuffer(data);
        if (!resource.isEmpty()) return resource.toDataURL();
      }
    }
    const bundleEnd = mac ? executable.indexOf('.app/') : -1;
    const target = bundleEnd >= 0 ? executable.slice(0, bundleEnd + 4) : executable;
    const icon = await app.getFileIcon(target, { size: 'normal' });
    return icon.isEmpty() ? undefined : icon.toDataURL();
});
const appIcon = (executable: string) => icons.get(executable);
const soundFile = join(__dirname, '../assets/reminder.wav');
const softSoundFile = join(__dirname, '../assets/reminder-soft.wav');
const audio = new ReminderAudio(async (event, mode, signal) => {
  if (demo || runtime.testData) return;
  await playReminder(event, mode, mode === 'soft' ? softSoundFile : soundFile, signal); audioError = undefined;
}, () => { audioError = '声音提醒没有正常播放。请检查系统音量和语音设置，也可以切换为提示音再试听。'; });

function notify(events: LimitEvent[]): void {
  audio.announce(events);
  if (!reminderPopupEnabled) return;
  for (const event of events) {
    if (!runtime.testData && Notification.isSupported()) {
      systemNotification?.close();
      const notification = new Notification({ title: localize(event.title), body: localize(event.message), silent: true });
      systemNotification = notification;
      notification.on('click', showWindow);
      notification.on('close', () => { if (systemNotification === notification) systemNotification = null; });
      notification.show();
    }
    if (['grace', 'warning', 'blocked', 'attempt', 'error'].includes(event.kind)) {
      reminderEventId = event.id;
      if (!reminder || reminder.isDestroyed()) {
        const bounds = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
        const width = 340, height = 200;
        reminder = new BrowserWindow({ width, height, x: bounds.x + bounds.width - width - 20, y: bounds.y + bounds.height - height - 20, frame: false, transparent: true, hasShadow: true, alwaysOnTop: true, skipTaskbar: true, resizable: false, show: false, backgroundColor: '#00000000', webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
        configureWindow(reminder); loadView(reminder, true);
        const created = reminder;
        created.on('closed', () => { if (reminder === created) { reminder = null; reminderEventId = undefined; } });
        if (mac) reminder.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        else reminder.setAlwaysOnTop(true, 'screen-saver');
        created.once('ready-to-show', () => { if (reminder === created && !created.isDestroyed()) created.showInactive(); });
      } else reminder.showInactive();
      const rule = service.snapshot().rules.find(rule => rule.id === event.ruleId);
      if (rule) void appIcon(rule.path).then(() => { if (reminder && !reminder.isDestroyed() && reminder.isVisible()) reminder.webContents.send('snapshot', decorate(service.snapshot())); });
    }
  }
}

async function boot(): Promise<void> {
  app.setAppUserModelId(legacyAppId);
  setLanguagePreference('system', systemLocale());
  const reminderSettings = await loadReminderPreferences(app.getPath('userData'));
  setLanguagePreference(reminderSettings.language, systemLocale());
  const directory = join(app.getPath('userData'), demo ? 'demo' : mac ? 'macos' : 'local');
  const store = new AtomicStateStore(directory);
  const windowsAdapter = !demo && !mac ? await createWindowsAdapter(join(app.getPath('userData'), 'native'), join(__dirname, '../assets/windows-process-query.cs')) : undefined;
  if (windowsAdapter) { windowsQueryError = windowsAdapter.nativeQueryError; windowsPrivilege = await getWindowsPrivilege(); }
  reminderAudioMode = reminderSettings.audio; reminderPopupEnabled = reminderSettings.popup; audio.setMode(demo ? 'off' : reminderAudioMode);
  service = new LimitService({ mode: demo ? 'demo' : mac ? 'macos' : 'windows', directory, ownExecutable: process.execPath, storage: store, capture: mac ? macAdapter.capture : () => windowsAdapter!.capture(), captureForPicker: windowsAdapter?.captureForPicker, windowsPrivilege, terminate: targets => mac ? macAdapter.terminate(targets, process.execPath) : windowsAdapter!.terminate(targets, process.execPath, windowsPrivilege === 'administrator'), notify });
  await service.initialize();
  service.startAtLogin = !demo && !development && !runtime.testData && app.getLoginItemSettings().openAtLogin;
  if (store.recovered) dialog.showMessageBox({ type: 'warning', buttons: [t('知道了')], message: t('已从本地备份恢复规则'), detail: t('主文件不可读取。已保留备份中的额度；近期少量计时可能未包含在备份中。') });
  registerIpc();
  const icon = nativeImage.createFromPath(join(__dirname, mac ? '../assets/trayTemplate.png' : '../assets/tray.png'));
  if (mac) icon.setTemplateImage(true);
  tray = new Tray(mac ? icon : icon.resize({ width: 20, height: 20 })); tray.on('click', showWindow);
  if (mac && !app.isPackaged) app.dock?.setIcon(nativeImage.createFromPath(join(__dirname, '../assets/icon-mac.png')));
  let menuState = '';
  const updateTray = (snapshot: AppSnapshot) => {
    const state = `${getLanguage()}:${snapshot.health.monitoring}:${snapshot.rules.length === 0}`; if (state === menuState) return; menuState = state;
    tray?.setToolTip(t('Pactime · 应用限额'));
    tray?.setContextMenu(Menu.buildFromTemplate([
    { label: t('打开Pactime'), click: showWindow },
    { label: snapshot.health.monitoring ? snapshot.rules.length ? t('正在监测') : t('尚无规则') : t('运行需要检查'), enabled: false },
    { type: 'separator' },
    { label: t('退出Pactime'), enabled: development || demo || snapshot.rules.length === 0, click: () => { quitting = true; app.quit(); } }
  ])); };
  refreshTrayMenu = () => updateTray(service.snapshot());
  service.subscribe(snapshot => {
    if (snapshot.health.monitoring) audio.recovered();
    const hasRules = snapshot.rules.length > 0;
    if (!demo && !development && !runtime.testData && hasRules && (!hadRules || Date.now() - lastLoginCheck >= 60_000)) {
      lastLoginCheck = Date.now();
      try {
        service.startAtLogin = app.getLoginItemSettings().openAtLogin;
        if (!service.startAtLogin) { app.setLoginItemSettings({ openAtLogin: true, args: loginArgs() }); service.startAtLogin = app.getLoginItemSettings().openAtLogin; }
        startupError = service.startAtLogin ? undefined : '请在系统设置中允许 Pactime 登录启动。';
      } catch { startupError = '无法设置登录启动，请检查系统设置。'; }
    }
    hadRules = hasRules;
    const decorated = decorate(snapshot);
    if (reminderEventId && !activeReminder(decorated)) dismissReminder();
    for (const target of [window, reminder]) if (target && !target.isDestroyed() && target.isVisible()) target.webContents.send('snapshot', decorated);
    updateTray(snapshot);
  });
  ready = true;
  if (requestedOpen || (!process.argv.includes('--background') && !(mac && !demo && app.getLoginItemSettings().wasOpenedAtLogin))) showWindow();
  updateTray(service.snapshot());
  await service.sample(0);
  const poll = async () => { await service.sample(); if (!quitting) setTimeout(() => { void poll(); }, 2000); };
  setTimeout(() => { void poll(); }, 2000);
  powerMonitor.on('suspend', () => service.setAwake(false));
  powerMonitor.on('resume', () => { service.setAwake(true); void service.sample(0); });
  app.on('activate', showWindow);
  app.on('before-quit', event => { if (!quitting && !development && !demo && service.snapshot().rules.length) { event.preventDefault(); showWindow(); void dialog.showMessageBox(window!, { buttons: [t('知道了')], message: t('规则仍在生效，Pactime会继续后台运行。'), detail: t('移除规则将于明天生效；届时没有规则后可以正常退出。') }); } else quitting = true; });
  app.on('window-all-closed', () => {});
  app.on('will-quit', () => audio.setMode('off'));
}

function registerIpc(): void {
  const id = z.string().uuid();
  const budget = z.number().int().min(60).max(86_400);
  const grace = z.number().int().min(0).max(1800);
  const input = z.object({ name: z.string().trim().min(1).max(80), path: z.string().min(1).max(4096), limitSeconds: budget, graceSeconds: grace.optional(), includeChildren: z.boolean() });
  const patch = z.object({ name: z.string().trim().min(1).max(80).optional(), limitSeconds: budget.optional(), graceSeconds: grace.optional(), includeChildren: z.boolean().optional() });
  function handle(channel: string, callback: (...args: any[]) => unknown): void {
    ipcMain.handle(channel, (event, ...args) => {
      if (event.sender !== window?.webContents && event.sender !== reminder?.webContents) throw new Error('请求来源不受信任。');
      return callback(...args);
    });
  }
  handle('snapshot', () => decorate(service.snapshot()));
  handle('test-tools-tap', async () => {
    if (!window || window.isDestroyed() || !await window.webContents.executeJavaScript('Boolean(document.querySelector(".settings-list"))')) throw new Error('请在设置页启用测试工具。');
    return testTools.tap();
  });
  handle('reset-test-data', async () => {
    if (!testTools.unlocked) throw new Error('测试工具尚未启用。');
    if (elevationInFlight) throw new Error('请先完成或取消管理员重启，再重置测试数据。');
    if (!window || window.isDestroyed() || !await window.webContents.executeJavaScript('Boolean(document.querySelector(".settings-list .test-reset-dialog[open]"))')) throw new Error('请从设置页确认重置测试数据。');
    await service.resetForTesting();
    audio.setMode('off'); audio.setMode(demo ? 'off' : reminderAudioMode); audio.recovered(); audioError = undefined;
    dismissReminder();
  });
  const resolveTarget = async (value: unknown) => {
    if (demo) throw new Error('体验模式不会读取本机文件。请在桌面版中拖入应用。');
    const file = z.string().min(1).max(4096).parse(value);
    return mac ? macAdapter.resolveTarget(file, process.execPath) : resolveWindowsTarget(file, process.execPath, { readShortcut: path => shell.readShortcutLink(path) });
  };
  handle('processes', () => {
    if (!pickerInFlight) pickerInFlight = service.listProcesses().then(processes => demo ? processes : Promise.all(processes.map(async p => ({ ...p, icon: p.path ? await appIcon(p.path) : undefined })))).finally(() => { pickerInFlight = undefined; });
    return pickerInFlight;
  });
  handle('choose-executable', async () => {
    if (demo) return null;
    const selected = await dialog.showOpenDialog(window!, { title: t('选择受限应用'), buttonLabel: t('选择应用'), defaultPath: mac ? '/Applications' : app.getPath('desktop'), filters: [{ name: mac ? t('Mac 应用') : t('Windows 程序或快捷方式'), extensions: mac ? ['app'] : ['exe', 'lnk', 'url'] }], properties: ['openFile'] });
    if (selected.canceled) return null;
    return resolveTarget(selected.filePaths[0]);
  });
  handle('resolve-target', resolveTarget);
  const updateReminderSettings = (patch: Partial<ReminderSettings>) => {
    const task = reminderSettingsQueue.then(async () => {
      const settings: ReminderSettings = { audio: reminderAudioMode, popup: reminderPopupEnabled, language: getLanguagePreference(), ...patch };
      await saveReminderSettings(reminderSettingsDirectory(app.getPath('userData')), settings);
      reminderAudioMode = settings.audio; reminderPopupEnabled = settings.popup;
      if (patch.language !== undefined) {
        setLanguagePreference(settings.language, systemLocale());
        audio.setMode('off'); audio.setMode(demo ? 'off' : reminderAudioMode);
        systemNotification?.close(); systemNotification = null;
        refreshTrayMenu();
      }
      if (patch.audio !== undefined) { audio.setMode(demo ? 'off' : reminderAudioMode); audioError = undefined; }
      if (!reminderPopupEnabled) dismissReminder();
      for (const target of [window, reminder]) if (target && !target.isDestroyed() && target.isVisible()) target.webContents.send('snapshot', decorate(service.snapshot()));
    });
    reminderSettingsQueue = task.catch(() => {}); return task;
  };
  handle('language', value => updateReminderSettings({ language: z.enum(['system', 'zh-CN', 'en']).parse(value) }));
  handle('reminder-audio', value => updateReminderSettings({ audio: z.enum(['voice', 'soft', 'sound', 'off']).parse(value) }));
  handle('reminder-popup', value => updateReminderSettings({ popup: z.boolean().parse(value) }));
  handle('test-reminder-audio', async () => {
    if (demo) return;
    try { await audio.preview({ id: 'preview', at: Date.now(), kind: 'warning', title: '今天的可用时间快用完了', message: '请留意时间提醒。' }); }
    catch (error) {
      if (error instanceof Error && /取消|关闭|替代|开启/.test(error.message)) throw error;
      throw new Error('试听没有播放成功。请检查系统音量和语音设置，也可以切换为提示音后再试听。');
    }
  });
  handle('restart-elevated', async () => {
    if (!decorate(service.snapshot()).canRestartElevated) throw new Error('当前运行方式不支持管理员重启。');
    if (elevationInFlight) throw new Error('正在等待 Windows 权限确认，请先完成当前请求。');
    if (window && !window.isDestroyed() && await window.webContents.executeJavaScript('Boolean(document.querySelector("dialog[open]"))')) throw new Error('请先保存或取消正在编辑的规则，再以管理员身份重启。');
    elevationInFlight = true;
    try {
      await service.prepareForRestart();
      await reminderSettingsQueue;
      await requestWindowsElevation(process.execPath, app.getPath('userData'));
      const handoffStarted = Date.now();
      await service.prepareForRestart();
      if (Date.now() - handoffStarted > 30_000) throw new Error('保存规则耗时过长，已取消这次重启。当前实例会继续运行，请稍后再试。');
      audio.setMode('off'); quitting = true; app.exit(0);
    } finally { elevationInFlight = false; }
  });
  handle('add-rule', async value => { const rule = input.parse(value); await service.addRule(rule); if (!demo) await appIcon(rule.path); });
  handle('change-rule', (ruleId, value) => service.changeRule(id.parse(ruleId), patch.parse(value)));
  handle('remove-rule', ruleId => service.removeRule(id.parse(ruleId)));
  handle('show-main-window', () => showWindow());
  handle('appearance', value => { nativeTheme.themeSource = z.enum(['light', 'dark', 'system']).parse(value); });
  handle('start-at-login', value => {
    if (development) throw new Error('开发模式不修改系统开机设置。');
    if (demo) throw new Error('体验模式不修改系统启动设置。');
    if (runtime.testData) throw new Error('测试运行不修改登录启动设置。');
    if (!value && service.snapshot().rules.length) throw new Error('仍有生效规则，不能关闭自动启动。全部规则移除后可关闭。');
    app.setLoginItemSettings({ openAtLogin: z.boolean().parse(value), args: loginArgs() });
    service.startAtLogin = app.getLoginItemSettings().openAtLogin;
    startupError = value && !service.startAtLogin ? '请在系统设置中允许 Pactime 登录启动。' : undefined;
    if (startupError) throw new Error(startupError);
    return service.snapshot();
  });
  handle('reveal-data', async () => { const error = await shell.openPath(service.snapshot().dataDirectory); if (error) throw new Error(`无法打开数据位置：${error}`); });
  handle('demo-advance', value => service.demoAdvance(z.number().int().min(1).max(86400).parse(value)));
  handle('demo-running', (path, running) => service.demoSetRunning(z.string().parse(path), z.boolean().parse(running)));
  handle('dismiss-reminder', dismissReminder);
}
