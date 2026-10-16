import type { ProcessIdentity, ProcessInfo, SelectedApplication } from '../core/types';
import { normalizePath } from '../core/processes';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { stat, mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const execute = promisify(execFile);

export function validateTargetPath(target: string, ownExecutable: string): void {
  const normal = normalizePath(target); const windows = normalizePath(process.env.SystemRoot ?? 'C:\\Windows');
  if (!path.win32.isAbsolute(target) || !normal.endsWith('.exe') || /[\x00-\x1f]/.test(target)) throw new Error('请选择完整路径的 .exe 应用。');
  if (normal === windows || normal.startsWith(`${windows}\\`) || normal === normalizePath(ownExecutable)) throw new Error('不能限制Windows系统程序或Pactime自身。');
}

export const encodePowerShell = (source: string): string => Buffer.from(source, 'utf16le').toString('base64');
export function buildPowerShellSource(source: string): string {
  return `$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
${source}
} catch {
  $failure = ConvertTo-Json -InputObject ([PSCustomObject]@{ message = $_.Exception.Message; code = $_.FullyQualifiedErrorId }) -Compress
  # ASCII framing avoids the Windows host's CLIXML and console code-page conversion.
  [Console]::Error.WriteLine('PACTIME_PS_ERROR:' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($failure)))
  exit 1
}`;
}

export function isWindowsAccessError(error: unknown): boolean {
  const value = typeof error === 'string' ? error : `${(error as Error)?.message ?? ''} ${(error as NodeJS.ErrnoException)?.code ?? ''}`;
  return /access\s*(?:is\s*)?denied|unauthorized|拒绝访问|访问被拒绝|权限不足|无法核验程序身份|0x80070005|EACCES|EPERM/i.test(value);
}

function powerShellFailure(error: unknown): Error {
  const failure = error as NodeJS.ErrnoException & { stderr?: string; killed?: boolean };
  if (failure.name === 'AbortError') return failure;
  if (failure.killed || failure.code === 'ETIMEDOUT') return Object.assign(new Error('Windows 操作超时，请重试。'), { code: 'ETIMEDOUT' });
  if (failure.code === 'ENOENT') return Object.assign(new Error('未找到 Windows PowerShell，无法执行本机操作。'), { code: 'ENOENT' });
  const framed = failure.stderr?.match(/(?:^|\n)PACTIME_PS_ERROR:([A-Za-z0-9+/=]+)\r?(?:\n|$)/);
  if (framed) {
    try {
      const data = JSON.parse(Buffer.from(framed[1], 'base64').toString('utf8'));
      if (typeof data.message === 'string' && typeof data.code === 'string') {
        const message = data.message.replace(/[\r\n\t]+/g, ' ').slice(0, 400);
        const code = data.code.replace(/[^a-zA-Z0-9_,.-]/g, '').slice(0, 120);
        return Object.assign(new Error(`Windows 操作失败：${message}${code ? `（${code}）` : ''}`), { code });
      }
    } catch { /* A damaged error frame falls back to a concise message. */ }
  }
  return new Error('Windows 操作失败，请重试；如果仍然失败，请反馈发生问题时的操作。');
}

export async function powershell(source: string, timeout = 15_000, signal?: AbortSignal): Promise<string> {
  const shell = path.win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  try {
    const { stdout } = await execute(shell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShell(buildPowerShellSource(source))], { windowsHide: true, timeout, signal, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' });
    return stdout.replace(/^\uFEFF/, '').trim();
  } catch (error) { throw powerShellFailure(error); }
}

// CIM may omit ExecutablePath without debug privileges. .NET can often still read
// the same process via its query interface. Both discovery and closing use this fallback.
const processIdentityScript = `function Read-ProcessIdentity($item, $nativeProcess) {
  $executable = [string]$item.ExecutablePath
  $birth = 0L
  if ($item.CreationDate) { $birth = ([DateTimeOffset]$item.CreationDate).ToUnixTimeMilliseconds() }
  if ((!$executable -or !$birth) -and $nativeQueryAvailable) {
    $basic = [Pactime.ProcessReader]::Read([int]$item.ProcessId)
    if ($basic.Path -and $basic.StartedAt -gt 0 -and (!$birth -or $birth -eq $basic.StartedAt)) {
      $executable = $basic.Path; $birth = $basic.StartedAt
    }
  }
  if (!$executable -or !$birth) {
    if (!$nativeProcess) { $nativeProcess = Get-Process -Id $item.ProcessId -ErrorAction SilentlyContinue }
    if ($nativeProcess) {
      if (!$executable) { try { $executable = [string]$nativeProcess.Path } catch {} }
      if (!$birth) { try { $birth = ([DateTimeOffset]$nativeProcess.StartTime).ToUnixTimeMilliseconds() } catch {} }
    }
  }
  [PSCustomObject]@{ path = $executable; startedAt = $birth }
}`;

function nativeQueryPrelude(library?: string): string {
  if (!library) return '$nativeQueryAvailable = $false';
  const encoded = Buffer.from(library).toString('base64');
  return `Add-Type -Path ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')))\n$nativeQueryAvailable = $true`;
}

export async function createWindowsAdapter(directory: string, sourceFile: string) {
  let library: string | undefined, nativeQueryError: string | undefined;
  try {
    const source = await readFile(sourceFile, 'utf8');
    const file = path.join(directory, `process-query-${createHash('sha256').update(source).digest('hex').slice(0, 12)}.dll`);
    await mkdir(directory, { recursive: true });
    try { await stat(file); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const payload = Buffer.from(JSON.stringify({ source, file }), 'utf8').toString('base64');
      await powershell(`$data = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}')) | ConvertFrom-Json\nAdd-Type -TypeDefinition $data.source -OutputAssembly $data.file`, 30_000);
    }
    await powershell(`${nativeQueryPrelude(file)}\n[Pactime.ProcessReader]::Read($PID) | Out-Null`);
    library = file;
  } catch { nativeQueryError = '本机未能加载增强进程查询组件，已使用备用查询方式。部分应用可能仍无法读取路径。'; }
  return { nativeQueryError, capture: () => capture(false, library), captureForPicker: () => capture(true, library),
    terminate: (targets: ProcessIdentity[], own: string, elevated = false) => terminateTargets(targets, own, library, elevated) };
}

async function capture(details: boolean, library?: string): Promise<ProcessInfo[]> {
  const json = await powershell(`${nativeQueryPrelude(library)}\n${processIdentityScript}
  $nativeById = @{}
  $descriptions = @{}
  ${details ? 'Get-Process -ErrorAction SilentlyContinue | ForEach-Object { $nativeById[[int]$_.Id] = $_ }' : ''}
  $items = @(Get-CimInstance Win32_Process | ForEach-Object {
    $nativeProcess = $nativeById[[int]$_.ProcessId]
    $identity = Read-ProcessIdentity $_ $nativeProcess
    $executable = $identity.path
    $title = ''; $description = ''
    ${details ? `if ($nativeProcess) { try { $title = [string]$nativeProcess.MainWindowTitle } catch {} }
    if ($executable) {
      if (!$descriptions.ContainsKey($executable)) {
        try { $version = [Diagnostics.FileVersionInfo]::GetVersionInfo($executable); $descriptions[$executable] = [string]$version.FileDescription } catch { $descriptions[$executable] = '' }
      }
      $description = $descriptions[$executable]
    }` : ''}
    if (!$identity.startedAt) { $executable = '' }
    [PSCustomObject]@{ pid = [int]$_.ProcessId; parentPid = [int]$_.ParentProcessId; name = [string]$_.Name; path = [string]$executable; startedAt = $identity.startedAt; displayName = [string]$description; windowTitle = [string]$title }
  })
  ConvertTo-Json -InputObject $items -Compress`);
  const parsed: unknown = JSON.parse(json || '[]');
  if (!Array.isArray(parsed)) throw new Error('Windows进程列表格式异常。');
  return parsed.filter((p): p is ProcessInfo => !!p && typeof p === 'object' && Number.isInteger(p.pid) && Number.isInteger(p.parentPid) && typeof p.name === 'string' && typeof p.path === 'string' && Number.isFinite(p.startedAt));
}
export const captureProcesses = (): Promise<ProcessInfo[]> => capture(false);
// Descriptions and window titles are collected only when the picker is opened/refreshed.
export const captureApplications = (): Promise<ProcessInfo[]> => capture(true);

export async function resolveWindowsTarget(selected: string, ownExecutable: string, dependencies: {
  readShortcut: (file: string) => { target: string };
  stat?: (file: string) => Promise<{ isFile(): boolean }>;
}): Promise<SelectedApplication> {
  if (!path.win32.isAbsolute(selected) || /[\x00-\x1f]/.test(selected)) throw new Error('请从本机选择程序文件或桌面快捷方式。');
  const extension = path.win32.extname(selected).toLowerCase();
  if (extension === '.url') throw new Error('这个快捷方式通过链接启动应用，无法直接确定实际程序。请先打开应用，再从运行列表中选择它。');
  if (!['.exe', '.lnk'].includes(extension)) throw new Error('请选择 .exe 程序或 .lnk 快捷方式。');
  let target = selected;
  if (extension === '.lnk') {
    try { target = dependencies.readShortcut(selected).target; }
    catch { throw new Error('无法读取这个快捷方式。请从运行列表中选择应用，或选择它的 .exe 文件。'); }
  }
  validateTargetPath(target, ownExecutable);
  let file;
  try { file = await (dependencies.stat ?? stat)(target); }
  catch { throw new Error('这个程序文件不存在或无法访问。请检查快捷方式是否仍然有效，或从运行列表中选择应用。'); }
  if (!file.isFile()) throw new Error('请选择程序文件，而不是文件夹。');
  return { path: target, name: path.win32.basename(target, path.win32.extname(target)), ...(extension === '.lnk' ? {
    note: `这个快捷方式指向 ${path.win32.basename(target)}，规则会限制这个程序。若它通过启动器打开另一个应用，请从运行列表中选择实际要限制的应用。`
  } : {}) };
}

export function buildTerminationScript(targets: ProcessIdentity[], library?: string): string {
  const payload = Buffer.from(JSON.stringify(targets), 'utf8').toString('base64');
  return `${nativeQueryPrelude(library)}\n${processIdentityScript}
  # Windows PowerShell 5.1 emits a JSON array as one pipeline object.
  # Assign it directly so foreach iterates identities, rather than a nested array.
  $targets = ConvertFrom-Json -InputObject ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}')))
  $results = @()
  foreach ($target in $targets) {
    $processId = [int]$target.pid
    if ($processId -le 4) { continue }
    $current = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
    if (!$current) { continue }
    $identity = Read-ProcessIdentity $current $null
    if (!$identity.path -or !$identity.startedAt) {
      $results += [PSCustomObject]@{ pid = $processId; ok = $false; message = '无法核验程序身份，请检查访问权限' }
      continue
    }
    if ($identity.startedAt -ne [long]$target.startedAt -or [string]$identity.path -ine [string]$target.path) { continue }
    try {
      Stop-Process -Id $processId -Force -ErrorAction Stop
      $results += [PSCustomObject]@{ pid = $processId; ok = $true; message = '' }
    } catch {
      $results += [PSCustomObject]@{ pid = $processId; ok = $false; message = $_.Exception.Message }
    }
  }
  ConvertTo-Json -InputObject $results -Compress`;
}

export async function terminateTargets(targets: ProcessIdentity[], ownExecutable: string, library?: string, elevated = false): Promise<string[]> {
  const allowed = targets.filter(target => {
    try { validateTargetPath(target.path, ownExecutable); return Number.isInteger(target.pid) && target.pid > 4 && target.pid !== process.pid && Number.isFinite(target.startedAt) && target.startedAt > 0; }
    catch { return false; }
  });
  if (!allowed.length) return [];
  // Descendants before launchers; this also reduces the opportunity to spawn replacements.
  const json = await powershell(buildTerminationScript([...allowed].sort((a, b) => b.startedAt - a.startedAt), library));
  const results = JSON.parse(json || '[]') as { pid: number; ok: boolean; message: string }[];
  return results.filter(r => !r.ok).map(r => {
    const advice = !isWindowsAccessError(r.message) ? '' : elevated ? 'Pactime 已以管理员身份运行，目标仍可能受到系统或进程保护；当前无法保证关闭它。' : '如果目标以管理员身份运行，请以管理员身份重新启动 Pactime。';
    return `无法关闭进程 ${r.pid}：${r.message}${advice ? `。${advice}` : ''}`;
  });
}
