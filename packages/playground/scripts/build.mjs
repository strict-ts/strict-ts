// Writes the playground under dist/: index.html, with its data and its script inlined, and typescript.js beside it;
// and playground.html, the same page as one file. The page loads nothing else: no CDN, no font.
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { page } from './page.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const { html, compiler } = await page();

rmSync(`${root}dist`, { recursive: true, force: true });
mkdirSync(`${root}dist`, { recursive: true });
writeFileSync(`${root}dist/index.html`, html);
copyFileSync(compiler, `${root}dist/typescript.js`);
// The same page as one file, the compiler inside it: for where only one file can be put (an artifact, an attachment).
const single = html.replace('<script src="typescript.js"></script>', () => `<script>${readFileSync(compiler, 'utf8').replaceAll('</script', '<\\/script')}</script>`);
writeFileSync(`${root}dist/playground.html`, single);
console.log(`playground: dist/index.html (${Math.round(html.length / 1024)} kB), dist/typescript.js, dist/playground.html (${Math.round(single.length / 1024)} kB)`);
