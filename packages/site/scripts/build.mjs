// Writes dist/: the website as a folder that any server of files shows, and that opens from the disk too.
// The packages must be built first (`pnpm build`).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite } from '../src/site.mjs';

const out = fileURLToPath(new URL('../dist/', import.meta.url));
const files = await buildSite();

rmSync(out, { recursive: true, force: true });
for (const [path, content] of files) {
  mkdirSync(dirname(`${out}${path}`), { recursive: true });
  writeFileSync(`${out}${path}`, content);
}
const size = [...files.values()].reduce((sum, content) => sum + content.length, 0);
console.log(`site: dist/ (${files.size} files, ${Math.round(size / 1024)} kB), open dist/index.html or run \`pnpm site:serve\``);
