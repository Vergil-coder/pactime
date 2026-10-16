import { powershell, encodePowerShell } from './windows';
export async function getWindowsPrivilege(): Promise<'standard' | 'administrator' | 'unknown'> {
  try {
    const value = await powershell('$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())\n$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)');
    return value.toLowerCase() === 'true' ? 'administrator' : 'standard';
  } catch { return 'unknown'; }
}

// Elevate a small broker first. Cancellation leaves the current app running. The
// broker waits for the saved, old process to exit before launching the elevated app.
export function buildElevationRequest(executable: string, directory: string, parentPid: number): string {
  const data = Buffer.from(JSON.stringify({ executable, directory, parentPid }), 'utf8').toString('base64');
  const broker = `$ErrorActionPreference = 'Stop'
  $data = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${data}')) | ConvertFrom-Json
  if (!(Test-Path -LiteralPath $data.executable -PathType Leaf)) { exit 1 }
  $parent = Get-Process -Id $data.parentPid -ErrorAction SilentlyContinue
  if ($parent -and !$parent.WaitForExit(45000)) { exit 1 }
  $argument = '--pactime-data-dir="' + $data.directory + '"'
  Start-Process -FilePath $data.executable -ArgumentList $argument -ErrorAction Stop`;
  const command = encodePowerShell(broker);
  return `Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList '-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand ${command}' -Verb RunAs -WindowStyle Hidden -ErrorAction Stop | Out-Null`;
}
export async function requestWindowsElevation(executable: string, directory: string): Promise<void> {
  try { await powershell(buildElevationRequest(executable, directory, process.pid), 120_000); }
  catch { throw new Error('没有完成管理员启动。若取消了 Windows 的权限确认，Pactime 会继续以当前权限运行；已有规则没有被清空。'); }
}
