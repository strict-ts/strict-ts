// The playground as the parts of a page: its style and its markup, its data, its script, and where the compiler it
// needs is found. The website (`packages/site`) puts them in a page of its own; nothing else shows the playground.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from '@typescript/typescript6';
import { build } from 'esbuild';
import { collect } from './data.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

/** The id of the element whose shadow tree holds `fragment`, and of the element that holds `data`. */
export const HOST = 'playground';
export const DATA = 'st-data';

/**
 * `fragment` is a style and the markup, for a shadow tree; `data` the JSON the script reads from the element `DATA`;
 * `script` the page's script, to run once `compiler` (the browser build of TypeScript 6) has defined `ts`.
 */
export async function parts() {
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
      js: `const DATA = JSON.parse(document.getElementById("${DATA}").textContent); const COMPILER = typeof ts === "undefined" ? undefined : ts;`,
    },
  });
  return {
    fragment: readFileSync(`${root}src/page.html`, 'utf8'),
    // Inside a script element, only a closing tag or a comment opener can end the content early.
    data: JSON.stringify(data).replaceAll('<', '\\u003c'),
    script: bundle.outputFiles[0]?.text ?? '',
    compiler,
    scenarios: data.scenarios.length,
  };
}
