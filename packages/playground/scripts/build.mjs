// Writes the playground under dist/: index.html, with its data and its script inlined, and typescript.js beside it.
// The page loads nothing else: no CDN, no font, no request outside its own two files.
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from '@typescript/typescript6';
import { build } from 'esbuild';
import { collect } from './data.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const { compiler, data } = collect(ts);

const bundle = await build({
  entryPoints: [`${root}src/app.ts`],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  minify: true,
  write: false,
  logLevel: 'warning',
  // The two globals the page's script reads: its data, and the compiler loaded by the script tag before it.
  banner: {
    js: 'const DATA = JSON.parse(document.getElementById("st-data").textContent); const COMPILER = typeof ts === "undefined" ? undefined : ts;',
  },
});
const script = bundle.outputFiles[0]?.text ?? '';

// Inside a script element, only a closing tag or a comment opener can end the content early.
const json = JSON.stringify(data).replaceAll('<', '\\u003c');
// The project's mark, from the one file that holds it: inlined in the header and as the page's icon.
const mark = readFileSync(`${root}../../assets/mark.svg`, 'utf8').trim();
const html = readFileSync(`${root}src/index.html`, 'utf8')
  .replace('<!--FAVICON-->', () => `data:image/svg+xml,${encodeURIComponent(mark)}`)
  .replace('<!--MARK-->', () => mark)
  .replace('<!--DATA-->', () => json)
  .replace('<!--APP-->', () => script.replaceAll('</script', '<\\/script'));

rmSync(`${root}dist`, { recursive: true, force: true });
mkdirSync(`${root}dist`, { recursive: true });
writeFileSync(`${root}dist/index.html`, html);
copyFileSync(compiler, `${root}dist/typescript.js`);
console.log(`playground: dist/index.html (${Math.round(html.length / 1024)} kB), dist/typescript.js`);
