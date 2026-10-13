// The page of the playground as a text, with its data and its script inlined, and where the compiler it loads
// beside it (`typescript.js`) is found. `scripts/build.mjs` writes it under dist/; the website shows the same page.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from '@typescript/typescript6';
import { build } from 'esbuild';
import { collect } from './data.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

/**
 * `site` is what the page shows beside its name when it is a page of a site: the links that lead back to it. Alone,
 * the page has nowhere to lead.
 */
export async function page({ site = '' } = {}) {
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
    .replace('<!--SITE-->', () => site)
    .replace('<!--DATA-->', () => json)
    .replace('<!--APP-->', () => script.replaceAll('</script', '<\\/script'));
  return { html, compiler };
}
