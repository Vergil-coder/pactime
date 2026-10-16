import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { isBuiltin } from 'node:module';
import './build-native.mjs';
const result = await build({ entryPoints: ['src/desktop/main.ts', 'src/desktop/preload.ts'], bundle: true, platform: 'node', target: 'node22', format: 'cjs', outdir: 'dist-desktop', outExtension: { '.js': '.cjs' }, external: ['electron'], sourcemap: true, metafile: true });
// Packages are already bundled. Fail before shipping if a new external would need node_modules.
for (const output of Object.values(result.metafile.outputs)) for (const dependency of output.imports) {
  if (dependency.external && dependency.path !== 'electron' && !isBuiltin(dependency.path)) throw new Error(`Unbundled runtime dependency: ${dependency.path}`);
}
const notices = await Promise.all(['react', 'react-dom', 'scheduler', 'lucide-react', 'zod'].map(async name => `${name}\n${await readFile(`node_modules/${name}/LICENSE`, 'utf8')}`));
await writeFile('dist-desktop/THIRD_PARTY_NOTICES.txt', notices.join('\n\n'));
