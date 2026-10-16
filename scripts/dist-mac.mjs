import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, copyFileSync, mkdirSync, symlinkSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('当前发行脚本需要 Apple Silicon Mac。');
// File Provider may add FinderInfo while signing inside Documents. Build on a local temporary volume.
const buildDirectory = mkdtempSync(join(tmpdir(), 'pactime-mac-build-'));
console.log(`Mac build directory: ${buildDirectory}`);
const args = ['node_modules/electron-builder/cli.js', '--mac', 'zip', '--arm64', `--config.directories.output=${buildDirectory}`];
const electronDist = process.env.PACTIME_ELECTRON_DIST ?? process.env.YULIANG_ELECTRON_DIST;
if (electronDist) args.push(`--config.electronDist=${electronDist}`);
execFileSync(process.execPath, args, { stdio: 'inherit' });
const { version, build: { productName } } = JSON.parse(readFileSync('package.json', 'utf8'));
const appDirectory = join(buildDirectory, 'mac-arm64');
const bundle = join(appDirectory, `${productName}.app`);
execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle], { stdio: 'inherit' });
symlinkSync('/Applications', join(appDirectory, 'Applications'));
const dmg = join(buildDirectory, `${productName}-${version}-macOS-arm64.dmg`);
// Use the built-in image tool to avoid a second Python toolchain and its global build lock.
execFileSync('/usr/bin/hdiutil', ['create', '-volname', productName, '-srcfolder', appDirectory, '-format', 'UDZO', '-ov', dmg], { stdio: 'inherit' });
execFileSync('/usr/bin/hdiutil', ['verify', dmg], { stdio: 'inherit' });
mkdirSync('release', { recursive: true });
for (const file of readdirSync(buildDirectory)) if (/\.(dmg|zip|blockmap|yml)$/.test(file)) copyFileSync(join(buildDirectory, file), join('release', file));
rmSync(join('release', `${productName}-${version}-macOS-arm64.dmg.blockmap`), { force: true });
if ((process.env.PACTIME_KEEP_BUILD ?? process.env.YULIANG_KEEP_BUILD) === '1') console.log(`Test executable: ${join(buildDirectory, `mac-arm64/${productName}.app/Contents/MacOS/${productName}`)}`);
else rmSync(buildDirectory, { recursive: true, force: true });
console.log('Mac packages ready in release/.');
