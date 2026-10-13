import { readdirSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { rules } from '@strict-ts/core';
import { beforeAll, describe, expect, test } from 'vitest';
// The site is plain JavaScript: an adapter around core.
// @ts-expect-error no declaration is written for it
import { linker, render, slug } from '../src/markdown.mjs';
// @ts-expect-error no declaration is written for it
import { buildSite, DOCS, demos, figures } from '../src/site.mjs';

const repo = join(import.meta.dirname, '../../..');
let files: ReadonlyMap<string, string | Uint8Array>;
const pageOf = (path: string): string => {
  const content = files.get(path);
  if (typeof content !== 'string') throw new Error(`${path} is not a text of the site`);
  return content;
};
const pages = (): readonly string[] => [...files.keys()].filter((path) => path.endsWith('.html'));
const escaped = (text: string): string => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

beforeAll(async () => {
  files = await buildSite();
}, 120_000);

describe('the website', () => {
  test('has a front page, the playground and a page for each document, each package and each example', () => {
    const examples = readdirSync(join(repo, 'examples'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => `docs/examples/${entry.name}.html`);
    expect(examples).toContain('docs/examples/invoice.html');
    expect(pages().toSorted()).toEqual(['404.html', 'index.html', 'playground.html', ...examples, ...DOCS.map((doc: { out: string }) => doc.out)].toSorted());
    expect(DOCS.map((doc: { out: string }) => doc.out)).toEqual(expect.arrayContaining(['docs/packages/core.html', 'docs/packages/site.html', 'docs/changelog.html']));
    for (const doc of DOCS as readonly { source: string; out: string }[]) {
      const title = /^# (.+)$/m.exec(readFileSync(join(repo, doc.source), 'utf8'))?.[1] ?? '';
      expect(pageOf(doc.out), doc.out).toContain(`<h1>${escaped(title)}</h1>`);
    }
  });

  test('shows an example with its sources, classic and conforming, and not what a build wrote beside them', () => {
    const invoice = pageOf('docs/examples/invoice.html');
    expect(invoice).toContain('<figcaption><span>examples/invoice/classic/invoice.ts</span></figcaption>');
    expect(invoice).toContain('<figcaption><span>examples/invoice/strict/unsafe/system.ts</span></figcaption>');
    expect(invoice).not.toContain('tsbuildinfo');
    expect(invoice).not.toContain('node_modules');
    expect(invoice).toContain(escaped(JSON.parse(readFileSync(join(repo, 'examples/invoice/package.json'), 'utf8')).description));
  });

  test('has no link that leads nowhere: every page and every anchor named is there', () => {
    const ids = new Map(pages().map((path) => [path, new Set([...pageOf(path).matchAll(/ id="([^"]+)"/g)].map((found) => found[1]))]));
    const broken: string[] = [];
    for (const path of pages()) {
      // The playground holds sources of programs as data: only what is before them is the page.
      const text = pageOf(path).split('<script id="st-data"')[0] ?? '';
      for (const found of text.matchAll(/ (?:href|src)="([^"]+)"/g)) {
        const to = (found[1] ?? '').replaceAll('&amp;', '&');
        if (/^[a-z][a-z0-9+.-]*:/i.test(to)) continue;
        const [file = '', anchor] = to.split('#');
        // The page shown for an address that is not one names the others from the root of the site.
        const target = file === '' ? path : file.startsWith('/') ? file.slice(1) : posix.normalize(posix.join(posix.dirname(path), file));
        if (!files.has(target)) broken.push(`${path}: ${to}`);
        else if (anchor !== undefined && anchor !== '' && ids.get(target)?.has(anchor) !== true) broken.push(`${path}: ${to}`);
      }
    }
    expect(broken).toEqual([]);
  });

  test('holds the whole documentation: a link to a document, a package or an example leads to its page', () => {
    for (const path of pages()) expect(pageOf(path).split('<script id="st-data"')[0], path).not.toContain('/src/branch/');
    expect(pageOf('docs/packages.html')).toContain('<a href="packages/core.html"><code>@strict-ts/core</code></a>');
    expect(pageOf('docs/examples.html')).toContain('<a href="examples/invoice.html"><code>invoice</code></a>');
    expect(pageOf('docs/getting-started.html')).toContain('<a href="examples/invoice.html"><code>examples/invoice</code></a>');
    expect(pageOf('docs/changelog.html')).toContain('<a href="adopting.html">');
  });

  test('loads nothing from elsewhere', () => {
    for (const path of pages()) {
      const text = pageOf(path).split('<script id="st-data"')[0] ?? '';
      const loaded = [...text.matchAll(/<(?:script|link|img|iframe)\b[^>]*\b(?:src|href)="([^"]+)"/g)].map((found) => found[1] ?? '');
      expect(loaded.filter((address) => /^(?:[a-z]+:)?\/\//i.test(address)), path).toEqual([]);
    }
    expect(pageOf('assets/site.css')).not.toMatch(/url\(|@import/);
  });

  test('shows of each sample what the checker says: refused as tsc accepts it, and nothing once it conforms', async () => {
    const shown = (await demos()) as readonly { tab: string; name: string; refused: { source: string; diagnostics: readonly { text: string; start?: number; end?: number }[] }; fixed: { diagnostics: readonly unknown[] } }[];
    expect(shown.length).toBeGreaterThanOrEqual(4);
    const names = rules.map((rule) => rule.name);
    for (const demo of shown) {
      expect(demo.refused.diagnostics.length, demo.tab).toBeGreaterThan(0);
      expect(demo.fixed.diagnostics, demo.tab).toEqual([]);
      for (const diagnostic of demo.refused.diagnostics) {
        // Each is in the words of the command line: the place, the rule, the message, and the help under it.
        const [, line, column, rule] = new RegExp(`^${demo.name.replace('.', '\\.')}:(\\d+):(\\d+) (\\S+) `).exec(diagnostic.text) ?? [];
        expect(names, diagnostic.text).toContain(rule);
        expect(diagnostic.text).toContain('\n  help: ');
        // And where it is marked in the text is where the line and the column say.
        const before = demo.refused.source.slice(0, diagnostic.start).split('\n');
        expect([before.length, (before.at(-1) ?? '').length + 1]).toEqual([Number(line), Number(column)]);
        expect(diagnostic.end).toBeGreaterThan(diagnostic.start ?? Number.POSITIVE_INFINITY);
      }
    }
    expect(shown.flatMap((demo) => demo.refused.diagnostics.map((diagnostic) => diagnostic.text.split(' ')[1]))).toEqual(expect.arrayContaining(['no-cast', 'no-any', 'no-throwing-call', 'no-throw', 'no-null', 'no-non-null', 'no-param-mutation', 'use-once']));
    // The first one is in the page before any script runs.
    const first = shown[0]?.refused.diagnostics[0]?.text ?? '';
    expect(first).toContain('no-cast');
    expect(pageOf('index.html')).toContain(escaped(first));
  });

  test('gives the page the checker it judged the samples with, the compiler and what a file is compiled against', () => {
    expect(pageOf('index.html')).toContain('data-engine="assets/typescript.js assets/environment.js assets/engine.js"');
    expect(files.get('assets/typescript.js')).toBeInstanceOf(Uint8Array);
    expect(pageOf('assets/engine.js')).toContain('StrictTsEngine');
    const environment = pageOf('assets/environment.js');
    const held = JSON.parse(environment.slice(environment.indexOf('=') + 1, environment.lastIndexOf(';'))) as { environment: { libs: Record<string, string>; std: Record<string, string> }; flags: Record<string, boolean> };
    expect(Object.keys(held.environment.libs)).toContain('lib.es2022.d.ts');
    expect(Object.keys(held.environment.std)).toContain('index.ts');
    expect(held.flags['strict']).toBe(true);
  });

  test('takes the scoreboard, the questions, the figures and the commands from the documents, and holds none of its own', () => {
    const front = pageOf('index.html');
    const readme = readFileSync(join(repo, 'README.md'), 'utf8');
    // The table of the guarantees is the README's, not a copy of it: a status of the README is on the page.
    const status = /\| Explicit mutability \|[^|]+\| ([^|]+) \|/.exec(readme)?.[1] ?? 'missing';
    expect(front).toContain(`<td>${status}</td>`);
    expect(front).toContain('<summary>Is it a new language, or a new compiler?</summary>');
    for (const figure of figures() as readonly { value: string }[]) expect(front).toContain(`<dt>${figure.value}</dt>`);
    for (const rule of rules) expect(front).toContain(`<li><code>${rule.name}</code></li>`);
    expect(front).toContain('npm install -D @strict-ts/cli @strict-ts/codemod');
    expect(front).toContain('strict-ts --update-baseline');
    // Each sample of the tour is a block of a document, under the heading it links to.
    expect(front).toContain('<a href="docs/examples.html#cart-who-changes-what">cart: who changes what →</a>');
    expect(front).toContain('<span class="fn">cheapestFirst</span>');
    expect(front).toContain('no-param-mutation Parameter `items` is mutated by `sort`.');
  });

  test('has one dress: every page has the same bar and the same sheet, the playground among them', () => {
    for (const path of pages()) {
      const text = pageOf(path);
      expect(text, path).toContain('<header class="top">');
      expect(text, path).toMatch(/<link rel="stylesheet" href="(?:(?:\.\.\/)+|\/)?assets\/site\.css">/);
      // The one sheet that is not the site's is the playground's own, inside its shadow tree.
      if (path !== 'playground.html') expect(text, path).not.toContain('<style');
    }
  });

  test('shows the playground as one of its pages: what its package hands over, in a shadow tree under the bar', () => {
    const playground = pageOf('playground.html');
    expect(playground).toContain('<body class="k-app">');
    expect(playground).toContain('<a href="playground.html" aria-current="page">Playground</a>');
    expect(playground).toContain('<main class="play" id="playground"><template shadowrootmode="open"><style>');
    expect(playground).toContain('<select id="preset"></select>');
    expect(playground).not.toContain('<footer class="foot">');
    // The scenarios, then the compiler and the script that reads both, in that order.
    expect(playground).toContain('"id":"challenge"');
    expect(playground).toMatch(/<script src="assets\/typescript\.js" defer><\/script>\n<script src="assets\/playground\.js" defer><\/script>/);
    expect(pageOf('assets/playground.js')).toContain('document.getElementById("st-data")');
  });

  test('gives the search every section of the documentation, under the address of its heading', () => {
    const script = pageOf('assets/search.js');
    const pieces = JSON.parse(script.slice(script.indexOf('=') + 1, script.lastIndexOf(';'))) as readonly { page: string; heading: string; to: string; text: string }[];
    const baseline = pieces.find((piece) => piece.to === 'docs/adopting.html#the-baseline');
    expect(baseline?.heading).toBe('The baseline');
    expect(baseline?.text).toContain('--update-baseline');
    expect(new Set(pieces.map((piece) => piece.page)).size).toBe(DOCS.length);
    for (const piece of pieces) {
      const [file = '', anchor] = piece.to.split('#');
      expect(files.has(file), piece.to).toBe(true);
      if (anchor !== undefined) expect(pageOf(file), piece.to).toContain(` id="${anchor}"`);
    }
  });
});

describe('a document as a page', () => {
  test('gives a heading the anchor the documents name it by', () => {
    expect(slug('The five guarantees')).toBe('the-five-guarantees');
    expect(slug('cart: who changes what')).toBe('cart-who-changes-what');
    const { title, html, headings } = render('# Title\n\n## One `two`\n\n## One two\n');
    expect([title, headings]).toEqual(['Title', [{ depth: 2, id: 'one-two', text: 'One two' }, { depth: 2, id: 'one-two-1', text: 'One two' }]]);
    expect(html).not.toContain('<h1');
  });

  test('colours a block that names its language, and leaves what a command printed as it is', () => {
    expect(render('```ts\nconst a = 1\n```').html).toContain('<span class="kw">const</span>');
    expect(render('```\ninvoice.ts:3:1 no-cast a < b\n```').html).toContain('<code>invoice.ts:3:1 no-cast a &lt; b</code>');
    expect(render('```sh\npnpm build\n```').html).toContain('<code>pnpm build</code>');
  });

  test('leads a link to a page of the site where there is one, and shows a name that is no link where there is none', () => {
    const pagesOf = new Map([['docs/rules.md', 'docs/rules.html'], ['examples', 'docs/examples.html'], ['README.md', 'index.html']]);
    const link = linker({ from: 'docs/adopting.md', out: 'docs/adopting.html', pages: pagesOf });
    expect(link('rules.md#the-rules')).toBe('rules.html#the-rules');
    expect(link('../examples')).toBe('examples.html');
    expect(link('../README.md')).toBe('../index.html');
    expect(link('../packages/core/test')).toBeUndefined();
    expect(render('See [the tests](../packages/core/test) and [the rules](rules.md).', link).html).toBe('<p>See the tests and <a href="rules.html">the rules</a>.</p>\n');
    expect(link('#here')).toBe('#here');
    expect(link('https://nodejs.org/')).toBe('https://nodejs.org/');
  });
});
