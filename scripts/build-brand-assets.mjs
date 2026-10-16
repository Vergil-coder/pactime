import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Every platform export comes from the approved Interlock vector masters.
const root = fileURLToPath(new URL('../', import.meta.url));
const brand = join(root, 'assets/brand');
const svg = name => readFileSync(join(brand, name), 'utf8');
function png(source, size) {
  return Buffer.from(new Resvg(source, { fitTo: { mode: 'width', value: size } }).render().asPng());
}
const rounded = svg('app-icon-rounded.svg');
const square = svg('app-icon-square.svg');
const mark = svg('mark-small.svg').replace(/color="[^"]+"/, 'color="#000000"');
const roundedBody = rounded.replace(/^[\s\S]*?<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const mac = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><g transform="translate(80 80) scale(.84375)">${roundedBody}</g></svg>`;
const exports = [
  ['assets/icon.png', rounded, 1024],
  ['assets/icon-mac.png', mac, 1024],
  ['assets/brand/app-icon-square.png', square, 1024],
  ['assets/tray.png', rounded, 32],
  ['assets/trayTemplate.png', mark, 20],
  ['assets/trayTemplate@2x.png', mark, 40],
  ['public/favicon.png', rounded, 32]
];
for (const [path, source, size] of exports) writeFileSync(join(root, path), png(source, size));

// ICO permits PNG-compressed frames on all supported Windows versions.
const sizes = [16, 24, 32, 48, 64, 128, 256];
const frames = sizes.map(size => png(rounded, size));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
frames.forEach((frame, index) => {
  const at = 6 + index * 16; const size = sizes[index];
  header[at] = size === 256 ? 0 : size; header[at + 1] = header[at];
  header.writeUInt16LE(1, at + 4); header.writeUInt16LE(32, at + 6);
  header.writeUInt32LE(frame.length, at + 8); header.writeUInt32LE(offset, at + 12); offset += frame.length;
});
writeFileSync(join(root, 'assets/icon.ico'), Buffer.concat([header, ...frames]));
const sourceFiles = ['mark.svg', 'mark-inverse.svg', 'mark-small.svg', 'mark-small-inverse.svg', 'wordmark.svg', 'wordmark-inverse.svg', 'logo-horizontal.svg', 'logo-horizontal-inverse.svg', 'app-icon-rounded.svg', 'app-icon-square.svg', 'manrope.ttf', 'OFL-Manrope.txt', 'OFL-Instrument-Serif.txt', 'brand.json'];
const hashes = Object.fromEntries(sourceFiles.map(name => [name, createHash('sha256').update(readFileSync(join(brand, name))).digest('hex')]));
writeFileSync(join(brand, 'manifest.json'), JSON.stringify({ name: 'Pactime', direction: 'Interlock', sources: hashes, generated: [...exports.map(([path]) => path), 'assets/icon.ico'], windowsFrames: sizes }, null, 2) + '\n');
console.log('Pactime Interlock: platform icons, template tray, favicon and asset manifest generated.');
