import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const execute = promisify(execFile);

// NSWorkspace can return a nonempty generic icon for an unregistered .app.
// Read its declared resource first. This runs only inside the bounded icon cache,
// never in the recurring process-capture path.
export async function readMacAppIcon(executable: string): Promise<Buffer | undefined> {
  const end = executable.indexOf('.app/');
  if (end < 0 || !path.isAbsolute(executable)) return undefined;
  let temporary: string | undefined;
  try {
    const bundle = executable.slice(0, end + 4);
    const { stdout } = await execute('/usr/bin/plutil', ['-extract', 'CFBundleIconFile', 'raw', '-o', '-', path.join(bundle, 'Contents/Info.plist')], { timeout: 3000, maxBuffer: 4096 });
    let name = stdout.trim();
    if (!name || /[/\\\x00-\x1f]/.test(name)) return undefined;
    if (!path.extname(name)) name += '.icns';
    if (!/\.(icns|png|tiff?|jpe?g)$/i.test(name)) return undefined;
    const resources = await realpath(path.join(bundle, 'Contents/Resources'));
    const file = await realpath(path.join(resources, name));
    if (!file.startsWith(resources + path.sep)) return undefined;
    const info = await stat(file);
    if (!info.isFile() || info.size === 0 || info.size > 8 * 1024 * 1024) return undefined;
    temporary = await mkdtemp(path.join(tmpdir(), 'pactime-icon-'));
    const output = path.join(temporary, 'icon.png');
    await execute('/usr/bin/sips', ['-s', 'format', 'png', '-Z', '64', file, '--out', output], { timeout: 5000, maxBuffer: 4096 });
    if ((await stat(output)).size > 256 * 1024) return undefined;
    return await readFile(output);
  } catch { return undefined; }
  finally { if (temporary) await rm(temporary, { recursive: true, force: true }).catch(() => {}); }
}
