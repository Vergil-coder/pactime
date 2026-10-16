import { t, localize, getLanguage } from '../shared/i18n';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppWindow, ArrowUpRight, Check, ChevronDown, Clock3, FolderOpen, History as HistoryIcon, Pencil, Plus, RefreshCw, Settings2, ShieldAlert, X } from 'lucide-react';
import type { AppSnapshot, ProcessInfo, RuleView, SelectedApplication } from '../core/types';
import { normalizePath } from '../core/processes';
import { bridge, desktopBridge } from './bridge';
import { duration, time, timer, date, historyDate } from './format';
import { ThemeControl } from './theme';
import { BrandMark, BrandLogo } from './Brand';
import { activeReminder } from '../core/reminders';
import { syncLanguage, useLanguage } from './language';
import { version } from '../../package.json';

const errorText = (error: unknown) => (error as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, '');
function AppIcon({ name, icon }: { name: string; icon?: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [icon]);
  return icon && !broken ? <img className="app-icon" src={icon} alt="" onError={() => setBroken(true)} /> : <span className="app-icon placeholder" aria-hidden="true">{name.slice(0, 1)}</span>;
}
function useSnapshot() {
  useLanguage();
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [error, setError] = useState('');
  const receive = useCallback((value: AppSnapshot) => { syncLanguage(value); setSnapshot(value); }, []);
  const refresh = useCallback(async () => {
    try { const value = await bridge.getSnapshot(); receive(value); setError(''); }
    catch (error) { setError(errorText(error)); throw error; }
  }, [receive]);
  useEffect(() => {
    const off = bridge.subscribe(receive);
    void refresh().catch(() => {});
    const visible = () => { if (document.visibilityState === 'visible') void refresh().catch(() => {}); };
    document.addEventListener('visibilitychange', visible);
    return () => { off(); document.removeEventListener('visibilitychange', visible); };
  }, [refresh, receive]);
  return { snapshot, error, refresh };
}
function useClock(value?: number, enabled = true) {
  const [now, setNow] = useState(value ?? Date.now());
  useEffect(() => { if (value !== undefined) setNow(value); }, [value]);
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const update = () => { clearInterval(interval); if (enabled && document.visibilityState === 'visible') interval = setInterval(() => setNow(now => now + 1000), 1000); };
    update(); document.addEventListener('visibilitychange', update);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', update); };
  }, [enabled]);
  return now;
}
const RULE_CHANGE_NOTE = '增加可用时间、延长关闭前的等待时间，或取消关联程序限制，都会从明天开始生效。减少可用时间、缩短等待时间，或开启关联程序限制，则会立即生效。';
const graceLabel = (seconds: number) => seconds ? t("{0}分钟", { 0: seconds / 60 }) : t("立即关闭");
function pendingLabel(rule: RuleView): string | undefined {
  const p = rule.pending;
  if (!p) return;
  if (p.delete) return t("明天移除");
  const parts = [];
  if (p.limitSeconds !== undefined) parts.push(duration(p.limitSeconds));
  if (p.graceSeconds !== undefined) parts.push(p.graceSeconds ? t("延迟关闭{0}", { 0: graceLabel(p.graceSeconds) }) : t("到时立即关闭"));
  if (p.includeChildren !== undefined) parts.push(p.includeChildren ? t("包含关联程序") : t("仅限此应用"));
  return t("明天生效：{0}", { 0: parts.join(' · ') });
}


function pendingExplanation(rule: RuleView): string | undefined {
  const pending = rule.pending;
  if (!pending) return;
  if (pending.delete) return t("这条规则会在明天移除，今天的限制仍然有效。");
  const changes = [];
  if (pending.limitSeconds !== undefined) changes.push(t("每天可用时间调整为 {0}", { 0: duration(pending.limitSeconds) }));
  if (pending.graceSeconds !== undefined) changes.push(pending.graceSeconds ? t("关闭前的等待时间调整为 {0}", { 0: graceLabel(pending.graceSeconds) }) : t("时间用完后立即关闭"));
  if (pending.includeChildren !== undefined) changes.push(pending.includeChildren ? t("同时限制关联程序") : t("只限制这个应用，不再限制关联程序"));
  return t("已保存的调整会从明天开始生效：{0}。", { 0: changes.join(getLanguage() === 'en' ? '; ' : '，') });
}

export default function App() {
  const { snapshot, error, refresh } = useSnapshot();
  const [page, setPage] = useState<'apps' | 'history' | 'settings'>('apps');
  const [editing, setEditing] = useState<RuleView | 'new' | null>(null);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState('');
  const now = useClock(snapshot?.now, page === 'apps' && !!snapshot?.rules.some(rule => rule.phase === 'grace'));
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 4500); return () => clearTimeout(id); }, [toast]);
  async function action(task: () => Promise<void>) {
    setBusy(true);
    try { await task(); await refresh(); } catch (e) { setToast(errorText(e)); }
    finally { setBusy(false); }
  }
  if (!snapshot) return <div className="loading"><BrandMark /><p role={error ? 'alert' : undefined}>{localize(error) || t("正在读取规则…")}</p>{error && <button className="secondary" onClick={() => void refresh().catch(() => {})}>{t("重试")}</button>}</div>;
  const attempt = snapshot.events.find(e => e.kind === 'attempt' && e.id !== dismissed && now - e.at < 30_000 && snapshot.rules.some(r => r.id === e.ruleId && r.phase === 'blocked'));
  return <div className="shell" onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }} onDrop={event => {
    event.preventDefault();
    if (!event.dataTransfer.files.length) return;
    if (editing) { setToast(t("请先完成或取消当前编辑，再拖入新的应用。")); return; }
    if (event.dataTransfer.files.length !== 1) { setToast(t("请一次拖入一个应用，分别设置它的可用时间。")); return; }
    setDroppedFile(event.dataTransfer.files[0]); setEditing('new');
  }}>
    <aside className="sidebar">
      <div className="app-name"><BrandLogo /></div>
      <nav aria-label={t("主导航")}>
        <button className={page === 'apps' ? 'active' : ''} onClick={() => setPage('apps')}><AppWindow size={17} />{t("应用")}</button>
        <button className={page === 'history' ? 'active' : ''} onClick={() => setPage('history')}><HistoryIcon size={17} />{t("记录")}</button>
        <button className={page === 'settings' ? 'active' : ''} onClick={() => setPage('settings')}><Settings2 size={17} />{t("设置")}</button>
      </nav>
      <div className="sidebar-bottom"><span className={`status-dot ${snapshot.health.monitoring ? '' : 'bad'}`} /><span>{snapshot.mode === 'demo' ? t("体验模式") : snapshot.health.monitoring ? snapshot.rules.length ? t("监测中") : t("尚无规则") : t("需要检查")}</span><span className="version" role={page === 'settings' ? 'button' : undefined} tabIndex={page === 'settings' ? 0 : undefined} aria-label={t("版本 v{0}", { 0: version })} onKeyDown={page === 'settings' ? event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } } : undefined} onClick={page === 'settings' ? async () => { try { if (await bridge.tapTestTools()) { await refresh(); } } catch (e) { setToast(errorText(e)); } } : undefined}>v{version}</span></div>
    </aside>
    <main className="main">
      <header className="toolbar"><h1>{page === 'apps' ? t("应用") : page === 'history' ? t("记录") : t("设置")}</h1><div className="toolbar-actions">{page !== 'settings' && <ThemeControl />}{page === 'apps' && <button className="primary" onClick={() => setEditing('new')}><Plus size={16} />{t("添加应用")}</button>}</div></header>
      <div className="main-content">
        {!snapshot.health.monitoring && <div role="alert" className="notice error"><ShieldAlert size={17} /><p>{localize(snapshot.health.message)}</p>{page !== 'settings' && snapshot.health.needsElevation && snapshot.canRestartElevated && <button className="secondary" disabled={busy} onClick={() => action(() => bridge.restartElevated())}>{t("以管理员身份重启")}</button>}</div>}
        {attempt && <div role="alert" className="notice"><ShieldAlert size={17} /><p><strong>{localize(attempt.title)}</strong><span>{t("应用会在明天 00:00 恢复使用。")}</span></p><button className="icon-button" aria-label={t("关闭限制提示")} onClick={() => setDismissed(attempt.id)}><X size={15} /></button></div>}
        {page === 'apps' && <>
          <div className="list-caption"><span>{t("{0} 个应用", { 0: snapshot.rules.length, count: snapshot.rules.length })}</span><span>{t("每天 00:00 恢复")}</span></div>
          {snapshot.rules.length ? <div className="table-scroll"><table className="apps-table"><thead><tr><th>{t("应用")}</th><th>{t("今日用时")}</th><th>{t("每日限额")}</th><th>{t("状态")}</th><th><span className="sr-only">{t("操作")}</span></th></tr></thead><tbody>{snapshot.rules.map(rule => <tr key={rule.id} className={rule.phase} onDoubleClick={() => setEditing(rule)}>
            <td><div className="app-cell"><AppIcon name={rule.name} icon={snapshot.icons?.[rule.path]} /><div><strong>{rule.name}</strong><small>{rule.running ? t("运行中{0}", { 0: rule.processCount > 1 ? t(" · {0} 个进程", { 0: rule.processCount }) : '' }) : t("未运行")}</small>{rule.pending && <small className="pending">{pendingLabel(rule)}</small>}</div></div></td>
            <td className="number-cell">{duration(Math.floor(rule.usedSeconds / 60) * 60)}<div className="usage-track" role="progressbar" aria-label={t("{0} 今日使用比例", { 0: rule.name })} aria-valuenow={Math.min(100, Math.round(rule.usedSeconds / rule.limitSeconds * 100))} aria-valuemin={0} aria-valuemax={100}><i style={{ transform: `scaleX(${Math.min(1, rule.usedSeconds / rule.limitSeconds)})` }} /></div></td>
            <td className="number-cell">{duration(rule.limitSeconds)}<small>{rule.graceSeconds ? t("延迟关闭：{0}", { 0: graceLabel(rule.graceSeconds) }) : t("到时立即关闭")}</small></td>
            <td className="state-cell">{rule.phase === 'ready' ? <><span className="state ready">{t("剩余 {0}", { 0: duration(rule.remainingSeconds) })}</span></> : rule.phase === 'grace' ? <><span className="state grace">{t("等待关闭")}</span><small>{t("{0} · {1} 关闭", { 0: timer((rule.graceDeadline! - now) / 1000), 1: time(rule.graceDeadline!) })}</small></> : <><span className="state blocked">{t("今日不可用")}</span><small>{t("明天恢复")}</small></>}</td>
            <td><button className="icon-button" aria-label={t("编辑 {0}", { 0: rule.name })} onClick={() => setEditing(rule)}><Pencil size={15} /></button></td>
          </tr>)}</tbody></table></div> : <div className="empty-state"><AppWindow size={28} /><h2>{t("尚未添加应用")}</h2><button className="primary" onClick={() => setEditing('new')}><Plus size={16} />{t("添加第一个应用")}</button></div>}
        </>}
        {page === 'history' && <History snapshot={snapshot} />}
        {page === 'settings' && <Settings snapshot={snapshot} busy={busy} action={action} />}
      </div>
      {snapshot.mode === 'demo' && <div className="demo-controls"><span>{t("演示操作")}</span><button disabled={busy} onClick={() => action(() => bridge.demoAdvance(600))}>{t("快进 10 分钟")}</button><button disabled={busy} onClick={() => action(() => bridge.demoAdvance(86400))}>{t("次日恢复")}</button>{snapshot.rules.filter(r => r.name === 'Steam').map(rule => <button key={rule.id} aria-label={t("{0} Steam（演示）", { 0: rule.running ? t("退出") : t("启动") })} disabled={busy} onClick={() => action(() => bridge.demoSetRunning(rule.path, !rule.running))}>{rule.running ? t("退出") : t("启动")} Steam</button>)}</div>}
    </main>
    {editing && <RulePanel rule={editing} snapshot={snapshot} initialFile={droppedFile} close={() => { setEditing(null); setDroppedFile(null); }} saved={async message => { setEditing(null); setDroppedFile(null); setToast(message); await refresh(); }} />}
    {toast && <div className="toast" role="status"><span>{localize(toast)}</span><button className="icon-button" aria-label={t("关闭提示")} onClick={() => setToast('')}><X size={15} /></button></div>}
  </div>;
}

function History({ snapshot }: { snapshot: AppSnapshot }) {
  const rows = [...snapshot.rules.map(r => ({ day: snapshot.date, name: r.name, usedSeconds: r.usedSeconds, limitSeconds: r.limitSeconds, ruleId: r.id })), ...snapshot.history];
  return <><section className="history-section"><h2>{t("应用用时")}</h2>{rows.length ? <div className="table-scroll"><table><thead><tr><th>{t("日期")}</th><th>{t("应用")}</th><th>{t("用时")}</th><th>{t("额度")}</th></tr></thead><tbody>{rows.map((r, i) => <tr key={`${r.day}-${r.ruleId}-${i}`}><td>{r.day === snapshot.date ? t("今天") : historyDate(r.day)}</td><td>{r.name}</td><td>{duration(Math.floor(r.usedSeconds / 60) * 60)}</td><td>{duration(r.limitSeconds)}</td></tr>)}</tbody></table></div> : <p className="muted empty-line">{t("暂无记录")}</p>}</section><section className="history-events"><h2>{t("提醒与变更")}</h2>{snapshot.events.map(e => <div className="history-event" key={e.id}><div><strong>{localize(e.title)}</strong><p>{localize(e.message)}</p></div><time>{date(e.at)} {time(e.at)}</time></div>)}{!snapshot.events.length && <p className="muted empty-line">{t("暂无提醒")}</p>}</section></>;
}
function Setting({ title, detail, children, className = '' }: { title: string; detail?: string; children?: ReactNode; className?: string }) {
  return <div className={`setting-row ${className}`}><div><h3>{title}</h3>{detail && <p>{localize(detail)}</p>}</div>{children}</div>;
}
function Settings({ snapshot, busy, action }: { snapshot: AppSnapshot; busy: boolean; action: (task: () => Promise<void>) => Promise<void> }) {
  const [resetOpen, setResetOpen] = useState(false);
  const [resetError, setResetError] = useState('');
  const available = snapshot.mode !== 'demo' && snapshot.startupMode !== 'development' && snapshot.startupMode !== 'test';
  const startupDetail = snapshot.mode === 'demo' ? t("体验模式不会修改本机的登录启动设置。") : snapshot.startupMode === 'development' ? t("本地开发版不会修改系统的登录启动设置。") : snapshot.startupMode === 'test' ? t("测试运行不会修改系统的登录启动设置。") : snapshot.startupError || (snapshot.rules.length ? t("还有生效中的规则时，需要保持登录启动开启，才能在重启后继续执行限制。") : t("开启后，Pactime 会在你登录电脑时启动，并开始监测受限应用。"));
  const reminderMode = snapshot.reminderAudio ?? (snapshot.mode === 'demo' ? 'off' : 'voice');
  const privilegeDetail = snapshot.windowsPrivilege === 'administrator' ? t("当前以管理员身份运行。若仍然无法关闭某个应用，它可能受到额外的系统或进程保护。") : t("当前未确认具有管理员权限。如果受限应用以管理员身份运行，可以在这里重新启动 Pactime；已有规则和用时会保留。管理员权限只对这次运行生效。");
  return <div className="settings-list"><h2>{t("外观")}</h2><div className="settings-group"><Setting title={t("主题")}><ThemeControl labels /></Setting><Setting title={t("语言")} className="language-setting" detail={t("界面和提醒会立即切换语言，已有规则和用时不受影响。")}><div className="theme-control with-labels" role="group" aria-label={t("语言")}>{([['system', t("跟随系统")], ['zh-CN', '简体中文'], ['en', 'English']] as const).map(([language, label]) => <button key={language} type="button" aria-pressed={(snapshot.language ?? 'system') === language} disabled={busy} onClick={() => action(() => bridge.setLanguage(language))}>{label}</button>)}</div></Setting></div><h2>{t("提醒")}</h2><div className="settings-group"><Setting title={t("弹窗提醒")} detail={t("开启后，会通过 Pactime 弹窗和系统通知提醒你。关闭后不会弹出提醒，计时和自动关闭仍会照常执行。")}><button className={`toggle ${(snapshot.reminderPopup ?? true) ? 'on' : ''}`} role="switch" aria-checked={snapshot.reminderPopup ?? true} aria-label={t("弹窗提醒")} disabled={busy} onClick={() => action(() => bridge.setReminderPopup(!(snapshot.reminderPopup ?? true)))}><span /></button></Setting><Setting title={t("声音提醒")} className="sound-setting" detail={snapshot.mode === 'demo' ? t("声音提醒在桌面版中可用，可以独立于弹窗设置。") : t("声音与弹窗独立设置。全屏使用时也可以通过语音或提示音收到提醒；选择关闭后，Pactime 和系统通知都不会发声。")}><div className="theme-control with-labels" role="group" aria-label={t("声音提醒方式")}>{([['voice', t("语音")], ['soft', t("轻提示音")], ['sound', t("标准提示音")], ['off', t("关闭")]] as const).map(([mode, label]) => <button key={mode} aria-pressed={reminderMode === mode} disabled={busy || snapshot.mode === 'demo'} onClick={() => action(() => bridge.setReminderAudio(mode))}>{label}</button>)}</div></Setting><Setting title={t("试听提醒")} detail={snapshot.audioError || (reminderMode === 'voice' ? t("语音会跟随所选语言，使用本机已有音色；没有对应音色时会播放提示音。") : undefined)}><button className="secondary" disabled={busy || snapshot.mode === 'demo' || reminderMode === 'off'} onClick={() => action(() => bridge.testReminderAudio())}>{t("试听提醒")}</button></Setting></div><h2>{t("通用")}</h2><div className="settings-group"><Setting title={t("登录时启动")} detail={startupDetail}><button className={`toggle ${snapshot.startAtLogin ? 'on' : ''}`} role="switch" aria-checked={snapshot.startAtLogin} aria-label={t("开机启动")} disabled={!available || busy || (snapshot.rules.length > 0 && snapshot.startAtLogin)} onClick={() => action(() => bridge.setStartAtLogin(!snapshot.startAtLogin))}><span /></button></Setting>{snapshot.mode === 'windows' && <Setting title={t("运行权限")} detail={privilegeDetail}>{snapshot.canRestartElevated && <button className="secondary" disabled={busy} onClick={() => action(() => bridge.restartElevated())}>{t("以管理员身份重启")}</button>}</Setting>}{snapshot.windowsQueryError && <Setting title={t("进程查询组件")} detail={snapshot.windowsQueryError} />}<Setting title={t("计时方式")} detail={t("只要受限应用或已纳入规则的关联程序还在运行，就会累计使用时间，切到后台后也会继续计时。电脑进入睡眠时会暂停计时。")} /><Setting title={t("规则恢复")} detail={t("每天 00:00 会恢复各应用的可用时间。增加时长、取消关联程序限制或移除规则的修改，会从明天开始生效；减少时长或开启关联程序限制，则会立即生效。")} /></div><h2>{t("数据")}</h2><div className="settings-group"><Setting title={t("数据保存在本机")}><button className="secondary" disabled={busy} onClick={() => action(() => bridge.revealData())}><FolderOpen size={14} />{t("打开数据位置")}</button></Setting><details className="setting-details"><summary><span>{t("权限与限制")}</span><ChevronDown size={15} aria-hidden="true" /></summary><p>{snapshot.mode === 'macos' ? t("在 Mac 上，Pactime 只能限制当前登录用户的普通应用。") : t("在 Windows 上，如果受限应用以管理员身份运行，Pactime 也需要相应权限才能正常计时和关闭它。")}  {t("拥有管理员权限的人仍然可以结束或卸载 Pactime。如果某个关联程序没有被识别，可以单独添加它的限制规则。全屏应用可能遮住提醒窗口，建议开启并试听声音提醒。")}</p><p className="data-path">{localize(snapshot.dataDirectory)}</p></details></div>{snapshot.testToolsUnlocked && <><h2>{t("测试工具")}</h2><div className="settings-group"><Setting title={t("重置测试数据")} detail={t("清空规则、今日用时和记录，立即解除现有的应用限制，方便重新测试。")}><button className="danger-button" disabled={busy} onClick={() => { setResetError(''); setResetOpen(true); }}>{t("重置测试数据")}</button></Setting></div></>}{resetOpen && <ResetTestDataDialog busy={busy} error={resetError} cancel={() => setResetOpen(false)} confirm={() => action(async () => { try { await bridge.resetTestData(); setResetOpen(false); } catch (e) { setResetError(errorText(e)); throw e; } })} />}</div>;
}


function ResetTestDataDialog({ busy, error, cancel, confirm }: { busy: boolean; error: string; cancel: () => void; confirm: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  return <dialog ref={dialog} className="rule-panel test-reset-dialog" aria-labelledby="test-reset-title" onCancel={event => { event.preventDefault(); if (!busy) cancel(); }}>
    <header className="panel-header"><h2 id="test-reset-title">{t("重置测试数据")}</h2><button className="icon-button" aria-label={t("关闭重置确认")} disabled={busy} onClick={cancel}><X size={17} /></button></header>
    <form onSubmit={event => { event.preventDefault(); if (!busy) void confirm(); }} aria-busy={busy}><div className="panel-scroll">
      <p className="field-note">{t("确认后，所有规则、今日用时、关闭倒计时和使用记录都会被清空，现有的应用限制会立即解除。主题、弹窗提醒、声音提醒、语言和登录启动设置会保留。这项操作仅用于重新开始测试。")}</p>
      {error && <p className="form-error" role="alert">{localize(error)}</p>}
    </div><footer className="panel-footer"><button className="secondary" type="button" disabled={busy} onClick={cancel}>{t("取消")}</button><button className="danger-button" type="submit" disabled={busy}>{busy ? t("重置中…") : t("确认重置")}</button></footer></form>
  </dialog>;
}

function RulePanel({ rule, snapshot, initialFile, close, saved }: { rule: RuleView | 'new'; snapshot: AppSnapshot; initialFile?: File | null; close: () => void; saved: (message: string) => Promise<void> }) {
  const original = rule === 'new' ? null : rule;
  const editing = !!original;
  const existing = original ? snapshot.rules.find(value => value.id === original.id) ?? null : null;
  const missing = editing && !existing;
  const [name, setName] = useState(original?.name ?? '');
  const [path, setPath] = useState(original?.path ?? '');
  const [minutes, setMinutes] = useState(original ? String((original.pending?.limitSeconds ?? original.limitSeconds) / 60) : '120');
  const [grace, setGrace] = useState(original ? String((original.pending?.graceSeconds ?? original.graceSeconds) / 60) : '20');
  const [children, setChildren] = useState(original?.pending?.includeChildren ?? original?.includeChildren ?? true);
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!editing);
  const [pickerError, setPickerError] = useState('');
  const [search, setSearch] = useState('');
  const [selectionNote, setSelectionNote] = useState('');
  const [selectionError, setSelectionError] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const selectionInFlight = useRef(false);
  async function loadProcesses() {
    setLoading(true); setPickerError('');
    try { setProcesses(await bridge.listProcesses()); } catch (error) { setPickerError(errorText(error)); }
    finally { setLoading(false); }
  }
  const matches = processes.filter(process => `${process.displayName ?? ''} ${process.windowTitle ?? ''} ${process.name} ${process.path}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
    if (!editing) void loadProcesses();
    if (!editing && initialFile) void select(() => bridge.resolveDroppedFile(initialFile));
    return () => dialog.current?.close();
  }, []);
  const loosens = !!existing && (Number(minutes) * 60 > existing.limitSeconds || Number(grace) * 60 > existing.graceSeconds || (existing.includeChildren && !children));
  function applySelection(selected: SelectedApplication) {
    if (snapshot.rules.some(rule => normalizePath(rule.path) === normalizePath(selected.path))) { setSelectionError(t("这个应用已经添加过了。请从应用列表中编辑现有规则。")); return; }
    setPath(selected.path); setName(selected.name.slice(0, 80)); setSelectionNote(selected.note ?? ''); setSelectionError(''); setError('');
  }
  async function select(task: () => Promise<SelectedApplication | null>) {
    if (busy || selectionInFlight.current) return;
    selectionInFlight.current = true; setSelecting(true); setSelectionError('');
    try { const selected = await task(); if (selected) applySelection(selected); }
    catch (e) { setSelectionError(errorText(e)); }
    finally { selectionInFlight.current = false; setSelecting(false); }
  }
  async function choose() { await select(() => bridge.chooseExecutable()); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy || selectionInFlight.current) return; setBusy(true); setError('');
    try {
      const limitSeconds = Number(minutes) * 60, graceSeconds = Number(grace) * 60;
      if (!Number.isInteger(Number(minutes)) || limitSeconds < 60 || limitSeconds > 86400) throw new Error(t("请输入 1 到 1440 之间的整数，作为每天可用的分钟数。"));
      if (!Number.isInteger(Number(grace)) || graceSeconds < 0 || graceSeconds > 1800) throw new Error(t("请输入 0 到 30 之间的整数；填 0 表示时间用完后立即关闭。"));
      if (missing) throw new Error(t("这条规则已经被移除，无法再保存修改。请关闭面板后重新添加应用。"));
      if (existing) await bridge.changeRule(existing.id, { name, limitSeconds, graceSeconds, includeChildren: children });
      else await bridge.addRule({ name, path, limitSeconds, graceSeconds, includeChildren: children });
      await saved(loosens ? t("修改已保存，放宽限制的部分会从明天开始生效。") : t("规则已保存。"));
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="rule-panel" onCancel={event => { event.preventDefault(); if (!busy) close(); }} aria-labelledby="panel-title"><header className="panel-header"><h2 id="panel-title">{editing ? t("编辑应用") : t("添加应用")}</h2><button className="icon-button" aria-label={t("关闭编辑面板")} disabled={busy} onClick={close}><X size={17} /></button></header><form onSubmit={submit} aria-busy={busy}><div className="panel-scroll">
    {!editing && <section className={`process-picker ${dragging ? 'dragging' : ''}`} onDragOver={event => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = busy || selecting ? 'none' : 'copy'; }} onDragEnter={event => { if (event.dataTransfer.types.includes('Files')) setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }} onDrop={event => {
      event.preventDefault(); event.stopPropagation(); setDragging(false);
      if (busy || selecting || !event.dataTransfer.files.length) return;
      if (event.dataTransfer.files.length !== 1) { setSelectionError(t("请一次拖入一个应用，分别设置它的可用时间。")); return; }
      const file = event.dataTransfer.files[0]; void select(() => bridge.resolveDroppedFile(file));
    }}>
      <div className="picker-heading"><label>{t("选择应用")}</label><div className="picker-actions">
        <button className="icon-button" type="button" aria-label={t("刷新运行列表")} title={t("刷新运行列表")} disabled={busy || selecting || loading} onClick={() => void loadProcesses()}><RefreshCw size={15} /></button>
        <button className="secondary" type="button" disabled={busy || selecting} onClick={snapshot.mode === 'demo' ? () => { setName(t("演示应用")); setPath('C:\\Apps\\ExampleClient\\client.exe'); } : choose}><FolderOpen size={14} />{snapshot.mode === 'demo' ? t("添加演示应用") : snapshot.mode === 'macos' ? t("浏览 .app 应用") : t("浏览程序或快捷方式")}</button>
      </div></div>
      <p className="picker-drop-note">{selecting ? t("正在读取所选应用…") : snapshot.mode === 'demo' ? t("桌面版支持直接拖入应用或快捷方式。") : snapshot.mode === 'macos' ? t("可以从访达把 .app 应用拖到这里，也可以从下面的运行列表选择。") : t("可以把 .exe 程序或桌面的 .lnk 快捷方式拖到这里，也可以从下面的运行列表选择。")}</p>
      {selectionError && <p className="form-error" role="alert">{selectionError}</p>}
      <input className="process-search" type="search" aria-label={t("搜索应用")} placeholder={t("搜索应用名称、窗口标题或路径")} value={search} onChange={event => setSearch(event.target.value)} />
      <div className="process-list">{loading ? <p className="muted">{t("正在读取运行中的应用…")}</p> : pickerError ? <div className="picker-error"><p role="alert">{pickerError}</p><button type="button" className="secondary" onClick={() => void loadProcesses()}>{t("重新读取")}</button></div> : matches.length ? matches.map(p => {
        const added = !!p.path && snapshot.rules.some(r => normalizePath(r.path) === normalizePath(p.path));
        const displayName = p.displayName || p.name.replace(/\.exe$/i, '');
        const detail = !p.path ? t("无法读取程序路径，可能需要管理员权限。") : added ? t("已添加") : [p.windowTitle, p.name, p.path].filter(Boolean).join(' · ');
        return <button key={p.path || `unreadable:${p.pid}`} type="button" disabled={!p.path || added || busy || selecting} className={p.path && path === p.path ? 'selected' : ''} onClick={() => applySelection({ path: p.path, name: displayName })}>
          <AppIcon name={displayName} icon={p.icon} /><span><strong>{p.path ? displayName : p.name}</strong><small title={localize(detail)}>{localize(detail)}</small></span>{p.path && path === p.path && <Check size={16} />}
        </button>;
      }) : <p className="muted">{search ? t("没有找到这个应用。试试其他名称，刷新运行列表，或拖入程序和快捷方式。") : t("当前没有可选的运行中应用。可以刷新列表，或通过拖入和浏览按钮选择应用。")}</p>}</div>
      {processes.some(p => !p.path) && <p className="field-note picker-permission-note">{t("Windows 没有提供部分程序的路径，它们暂时不能从列表中选择。你可以拖入或浏览它们的程序文件；如果应用以管理员身份运行，Pactime 也需要相应权限才能关闭它。")}</p>}
    </section>}
    <label className="field">{t("应用名称")}<input required disabled={busy || selecting || missing} maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label>
    {path && <p className="selected-path" title={path}>{path}</p>}
    {selectionNote && <p className="field-note selection-note">{localize(selectionNote)}</p>}
    <label className="field">{t("每天可用时间（分钟）")}<input type="number" required disabled={busy || selecting || missing} min={1} max={1440} step={1} value={minutes} onChange={e => setMinutes(e.target.value)} /></label>
    <fieldset className="grace-settings"><legend className="sr-only">{t("延迟关闭设置")}</legend><div className="grace-heading"><label htmlFor="grace-time">{t("到时后延迟关闭")}</label><div className="grace-input"><input id="grace-time" aria-label={t("延迟关闭时间（分钟）")} aria-describedby="grace-note" type="number" required disabled={busy || selecting || missing} min={0} max={30} step={1} value={grace} onChange={e => setGrace(e.target.value)} /><span>{t("分钟")}</span></div></div>
    <div className="grace-presets" aria-label={t("延迟关闭预设")}>{[0, 5, 10, 20, 30].map(value => <button type="button" disabled={busy || selecting || missing} aria-pressed={Number(grace) === value} className={Number(grace) === value ? 'selected' : ''} key={value} onClick={() => setGrace(String(value))}>{value === 0 ? t("立即关闭") : t("{0}分钟", { 0: value })}</button>)}</div>
    <p className="field-note" id="grace-note">{Number(grace) === 0 ? t("用完今天的可用时间后，Pactime 会立即强制关闭受限应用。请在时间用完前保存好正在处理的内容。") : t("用完今天的可用时间后，Pactime 会再等待 {0} 分钟，然后强制关闭受限应用。请在这段时间内保存内容并结束使用；提前结束这次使用后，今天就不能再重新打开。", { 0: grace })}</p></fieldset>
    <label className="checkbox-field"><input type="checkbox" disabled={busy || selecting || missing} checked={children} onChange={e => setChildren(e.target.checked)} /><span>{t("同时限制关联程序")}<small>{t("开启后，也会限制由这个应用启动且能识别到的关联程序。如果有应用未被识别，可以再单独添加一条规则。")}</small></span></label>
    {loosens && <p className="form-explanation"><Clock3 size={15} /><span>{t(RULE_CHANGE_NOTE)}</span></p>}
    {existing?.pending && <p className="field-note">{pendingExplanation(existing)}</p>}
    {missing && <p className="form-error" role="alert">{t("这条规则已经被移除，无法再保存修改。请关闭面板后重新添加应用。")}</p>}
    {error && <p className="form-error" role="alert">{localize(error)}</p>}
  </div><footer className="panel-footer">{existing && <button type="button" className="danger-button" aria-label={t("明天移除这条规则")} disabled={busy || existing.pending?.delete} onClick={async () => { setBusy(true); try { await bridge.removeRule(existing.id); await saved(t("已安排明天移除，今天的限制仍然有效。")); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }}>{t("移除应用")}</button>}<button type="button" className="secondary" disabled={busy} onClick={close}>{t("取消")}</button><button type="submit" className="primary" disabled={busy || selecting || missing || !path || !name.trim()}>{busy ? t("保存中…") : editing ? t("保存修改") : t("创建规则")}</button></footer></form></dialog>;
}

function ReminderHeader({ dismiss }: { dismiss: () => void }) {
  return <header className="reminder-top"><span><BrandMark small />Pactime</span><button className="icon-button" aria-label={t("收起提醒")} onClick={dismiss}><X size={15} /></button></header>;
}
export function Reminder() {
  const { snapshot, error, refresh } = useSnapshot();
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminError, setAdminError] = useState('');
  async function restartElevated() {
    setAdminBusy(true); setAdminError('');
    try { await bridge.restartElevated(); } catch (e) { setAdminError(errorText(e)); }
    finally { setAdminBusy(false); }
  }
  const event = snapshot ? activeReminder(snapshot) : undefined;
  const rule = snapshot?.rules.find(r => r.id === event?.ruleId);
  const now = useClock(snapshot?.now, !!rule && !!snapshot?.health.monitoring && (rule.phase === 'grace' || rule.running));
  const dismiss = () => desktopBridge?.dismissReminder();
  if (!snapshot) return <div className="reminder"><ReminderHeader dismiss={dismiss} /><div className="reminder-content reminder-loading"><p role={error ? 'alert' : undefined}>{localize(error) || t("正在读取规则…")}</p>{error && <button className="secondary" onClick={() => void refresh().catch(() => {})}>{t("重试")}</button>}</div></div>;
  const grace = rule?.phase === 'grace' ? rule : undefined;
  const problem = !snapshot.health.monitoring;
  const blocked = !problem && rule?.phase === 'blocked';
  const remaining = rule ? Math.max(0, rule.remainingSeconds - (rule.running ? Math.max(0, now - snapshot.now) / 1000 : 0)) : undefined;
  return <div className={`reminder ${problem ? 'has-problem' : blocked ? 'is-blocked' : ''}`}>
    <ReminderHeader dismiss={dismiss} />
    <div className="reminder-content">
      <div className="reminder-identity">
        {problem ? <span className="reminder-status-icon"><ShieldAlert size={20} /></span> : rule ? <AppIcon name={rule.name} icon={snapshot.icons?.[rule.path]} /> : <span className="reminder-status-icon"><Clock3 size={20} /></span>}
        <div><h2>{problem ? t("监测需要检查") : rule?.name ?? t("应用限时")}</h2><p>{problem ? t("请查看详情，检查当前的运行状态。") : blocked || grace ? t("今天的可用时间已经用完。") : rule ? t("今天的可用时间快用完了。") : t("当前没有待处理的时间提醒。")}</p></div>
      </div>
      {problem ? <div className="reminder-focus reminder-error"><p role={adminError ? 'alert' : undefined}>{localize(adminError || snapshot.health.message)}</p></div> : blocked ? <div className="reminder-focus reminder-restoration"><div><span className="reminder-label">{t("今日不可用")}</span><p>{t("明天 00:00 后可以重新打开。")}</p></div><Clock3 size={22} aria-hidden="true" /></div> : rule ? <div className="reminder-focus">
        <div><span className="reminder-label">{grace ? t("距离关闭") : t("今日剩余")}</span><div className="reminder-count" role="timer" aria-label={grace ? t("距离自动关闭的时间") : t("今日剩余可用时间")}>{timer(grace ? (grace.graceDeadline! - now) / 1000 : remaining!)}</div></div>
        <div className="reminder-deadline"><Clock3 size={14} aria-hidden="true" /><span>{grace ? t("将在 {0} 自动关闭", { 0: time(grace.graceDeadline!) }) : rule.graceSeconds ? t("达到限额后，再等 {0}关闭。", { 0: graceLabel(rule.graceSeconds) }) : t("达到限额后会立即关闭。")}</span></div>
      </div> : null}
    </div>
    <footer className="reminder-actions"><button className="reminder-link" onClick={async () => { await bridge.showMainWindow(); await dismiss(); }}>{problem ? t("查看详情") : t("查看规则")}<ArrowUpRight size={13} /></button>{problem && snapshot.health.needsElevation && snapshot.canRestartElevated ? <button className="primary" disabled={adminBusy} onClick={() => void restartElevated()}>{adminBusy ? t("等待权限确认…") : t("以管理员重启")}</button> : <button className="primary" aria-label={grace && !problem ? t("关闭截止提醒") : t("关闭提示")} onClick={dismiss}>{t("知道了")}</button>}</footer>
  </div>;
}
