// The website as texts: every file of it, by its path. It reads the documents of the repository, asks the checker
// what it says of the samples, and writes nothing: `scripts/build.mjs` does. No rule is here.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rules } from '@strict-ts/core';
import { allFlags, collect } from '@strict-ts/playground/data';
import { DATA, HOST, parts } from '@strict-ts/playground/page';
import ts from '@typescript/typescript6';
import { build as bundle } from 'esbuild';
import { Marked } from 'marked';
import { code, home } from './home.mjs';
import { page, PLAYGROUND } from './layout.mjs';
import { escape, linker, render, sectionOf, slug } from './markdown.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const text = (path) => readFileSync(`${repo}${path}`, 'utf8');

/** The packages that have a page: each is its README. */
const PACKAGES = readdirSync(`${repo}packages`).filter((name) => existsSync(`${repo}packages/${name}/README.md`)).sort();

/** What a folder of an example holds beside its sources: what a build wrote, and what every example has alike. */
const NOT_SHOWN = new Set(['node_modules', 'dist', 'package.json', 'tsconfig.json']);

/** The files of a folder that the site shows, each by its path from the folder, a folder after the files beside it. */
const filesOf = (directory, under = '') => {
  const entries = readdirSync(`${repo}${directory}/${under}`, { withFileTypes: true }).filter((entry) => !NOT_SHOWN.has(entry.name) && !entry.name.endsWith('.tsbuildinfo'));
  const named = (kept) => entries.filter(kept).map((entry) => entry.name).sort();
  return [...named((entry) => entry.isFile()).map((name) => `${under}${name}`), ...named((entry) => entry.isDirectory()).flatMap((name) => filesOf(directory, `${under}${name}/`))];
};

/** The examples of the repository: each folder is a page that shows its sources. */
const EXAMPLES = readdirSync(`${repo}examples`, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const exampleOut = (name) => `docs/examples/${name}.html`;

/** The documents of the repository that are pages, in the order of the list beside them. */
export const DOCS = [
  { group: 'Start', source: 'docs/getting-started.md', out: 'docs/getting-started.html', active: 'docs' },
  { group: 'Start', source: 'examples/README.md', out: 'docs/examples.html', active: 'examples' },
  { group: 'The rules', source: 'docs/rules.md', out: 'docs/rules.html', active: 'rules' },
  { group: 'The rules', source: 'docs/what-throws.md', out: 'docs/what-throws.html', active: 'rules' },
  { group: 'The rules', source: 'docs/unsafe-directories.md', out: 'docs/unsafe-directories.html', active: 'rules' },
  { group: 'The rules', source: 'docs/standard-library.md', out: 'docs/standard-library.html', active: 'rules' },
  { group: 'Tools', source: 'docs/cli.md', out: 'docs/cli.html', active: 'tools' },
  { group: 'Tools', source: 'docs/configuration.md', out: 'docs/configuration.html', active: 'tools' },
  { group: 'Tools', source: 'docs/adopting.md', out: 'docs/adopting.html', active: 'tools' },
  { group: 'Tools', source: 'docs/editor.md', out: 'docs/editor.html', active: 'tools' },
  { group: 'Tools', source: 'docs/probes.md', out: 'docs/probes.html', active: 'tools' },
  { group: 'The project', source: 'docs/known-limits.md', out: 'docs/known-limits.html', active: 'limits' },
  { group: 'The project', source: 'CONTRIBUTING.md', out: 'docs/contributing.html', active: 'docs' },
  { group: 'The project', source: 'CHANGELOG.md', out: 'docs/changelog.html', active: 'docs' },
  { group: 'Packages', source: 'docs/packages.md', out: 'docs/packages.html', active: 'tools' },
  ...PACKAGES.map((name) => ({ group: 'Packages', source: `packages/${name}/README.md`, out: `docs/packages/${name}.html`, active: 'tools' })),
];

/** Every folder a file is in, from the nearest one up. */
const foldersOf = (file) => file.split('/').slice(0, -1).map((_, index, parts) => parts.slice(0, index + 1).join('/'));

/** Which files of the repository a link may name, and the page each is. */
const PAGES = new Map([
  ...DOCS.map((doc) => [doc.source, doc.out]),
  ...PACKAGES.map((name) => [`packages/${name}`, `docs/packages/${name}.html`]),
  ...EXAMPLES.flatMap((name) => [[`examples/${name}`, exampleOut(name)], ...filesOf(`examples/${name}`).flatMap((file) => [file, ...foldersOf(file)]).map((path) => [`examples/${name}/${path}`, exampleOut(name)])]),
  ['examples', 'docs/examples.html'],
  ['README.md', 'index.html'],
  ['docs', 'docs/getting-started.html'],
]);

/** The way from one page of the site to another. */
const way = (from, to) => posix.relative(posix.dirname(from), to);

const inline = (markdown) => new Marked().parseInline(markdown);

/** The text of a piece of a page, without its tags: what the search looks into. */
const words = (html) => html.replace(/<[^>]+>/g, ' ').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&').replace(/\s+/g, ' ').trim();

/** A page cut at its headings: what the search answers with, each piece under the address of its heading. */
const pieces = (out, title, html) =>
  html.split(/(?=<h[23] id=")/).map((part) => {
    const found = /^<h[23] id="([^"]+)">([\s\S]*?)<\/h[23]>/.exec(part);
    if (found === null) return { page: title, heading: title, to: out, text: words(part) };
    return { page: title, heading: words(found[2] ?? '').replace(/^# ?/, ''), to: `${out}#${found[1]}`, text: words(part.slice(found[0].length)) };
  });

/**
 * A page of the documentation: the list of the documents on one side, the sections of this one on the other.
 * `at` is the place of the page in the list, or of the page it belongs to; `turns` says whether it names the page
 * before it and the one after.
 */
const shell = ({ out, at, title, eyebrow, html, sections, titles, chrome, turns, active }) => {
  const groups = [...new Set(DOCS.map((one) => one.group))];
  const side = groups
    .map((group) => `<h2>${group}</h2>\n${DOCS.flatMap((one, index) => (one.group === group ? [`<a href="${way(out, one.out)}"${index === at ? ' aria-current="page"' : ''}>${escape(titles[index])}</a>`] : [])).join('\n')}`)
    .join('\n');
  const here = sections.length < 2 ? '' : `<aside class="here"><h2>On this page</h2>\n${sections.map((heading) => `<a class="d${heading.depth}" href="#${heading.id}">${escape(heading.text)}</a>`).join('\n')}</aside>`;
  const turn = (index, label) => (DOCS[index] === undefined ? '<span></span>' : `<a href="${way(out, DOCS[index].out)}"><small>${label}</small>${escape(titles[index])}</a>`);
  const body = `<div class="doc">
<aside class="side"><nav aria-label="Documentation">${side}</nav></aside>
<main class="prose">
<p class="eyebrow">${eyebrow}</p>
<h1>${escape(title)}</h1>
${html}
${turns ? `<nav class="turn" aria-label="Other pages">${turn(at - 1, 'Before')}${turn(at + 1, 'Next')}</nav>` : ''}
</main>
${here}
</div>`;
  return page({ ...chrome, title: `${title} · strict-ts`, description: `${title}: the documentation of strict-ts.`, base: way(out, 'x').slice(0, -1), active, body, kind: 'doc' });
};

/** A document of the repository as a page. */
const document = (doc, index, titles, chrome, found) => {
  const { title, html, headings } = render(text(doc.source), linker({ from: doc.source, out: doc.out, pages: PAGES }));
  found.push(...pieces(doc.out, title, html));
  return shell({ out: doc.out, at: index, title, eyebrow: doc.group, html, sections: headings.filter((heading) => heading.depth <= 3), titles, chrome, turns: true, active: doc.active });
};

/** An example of the repository as a page: its sources, as they are at the commit the site is built from. */
const example = (name, titles, chrome) => {
  const out = exampleOut(name);
  const sources = filesOf(`examples/${name}`);
  const about = JSON.parse(text(`examples/${name}/package.json`)).description;
  const html = `<p>${escape(about)}</p>
<p>These are the sources of the example, as they are at the commit this site was built from: <code>classic</code> is what <code>tsc --strict</code> accepts, <code>strict</code> what conforms. <a href="${way(out, 'docs/examples.html')}">Examples</a> says what each is refused for, and each is a scenario of <a href="${way(out, PLAYGROUND)}">the playground</a>, where it can be changed.</p>
${sources.map((file) => `<h2 id="${slug(file)}"><a class="anchor" href="#${slug(file)}" aria-label="Link to this file">#</a>${escape(file)}</h2>\n${code(`examples/${name}/${file}`, text(`examples/${name}/${file}`).trimEnd())}`).join('\n')}`;
  return shell({ out, at: DOCS.findIndex((doc) => doc.out === 'docs/examples.html'), title: name, eyebrow: 'Examples', html, sections: sources.map((file) => ({ depth: 2, id: slug(file), text: file })), titles, chrome, turns: false, active: 'examples' });
};

/** A script of the site, as the text a page loads. */
const script = async (options) => (await bundle({ bundle: true, format: 'iife', target: 'es2023', minify: true, write: false, logLevel: 'warning', ...options })).outputFiles[0]?.text ?? '';

/** The script that checks a sample: the one the front page loads when a sample is changed. */
const engineScript = () => script({ entryPoints: [`${root}src/engine.js`], globalName: 'StrictTsEngine' });

/**
 * The samples of the front page, each as `tsc --strict` accepts it and as it conforms, with what the checker says of
 * both. It is asked through the script the page loads, run here as the page runs it.
 */
export const demos = async (engine) => {
  const made = new Function(`${engine ?? (await engineScript())}\nreturn StrictTsEngine;`)();
  const checker = made.create(ts, collect(ts).data.env, allFlags);
  const said = (name, file) => {
    const source = readFileSync(`${root}src/demos/${file}`, 'utf8');
    return { source, diagnostics: checker.judge(name, source) };
  };
  return JSON.parse(readFileSync(`${root}src/demos/demos.json`, 'utf8')).map((demo) => ({ tab: demo.tab, note: demo.note, name: demo.name, refused: said(demo.name, `${demo.file}.classic.ts`), fixed: said(demo.name, `${demo.file}.strict.ts`) }));
};

/**
 * The short name of the commit the site is built from. Outside a clone it is the one the builder names
 * (`SOURCE_COMMIT`, as a host that builds an image does), or `unknown`: the foot of each page says so.
 */
const commitOf = () => {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return /^[0-9a-f]{7,40}$/.test(process.env.SOURCE_COMMIT ?? '') ? process.env.SOURCE_COMMIT.slice(0, 7) : 'unknown';
  }
};

/** The blocks of code under a heading of a document, in order: the site shows them, and does not write them again. */
const blocksOf = (markdown, heading) => [...sectionOf(markdown, heading).matchAll(/```(\w*)\n([\s\S]*?)```/g)].map((found) => ({ language: found[1] ?? '', text: (found[2] ?? '').trim() }));

/** One of them, by its place: a document that no longer has it stops the build. */
const blockOf = (markdown, heading, at = 0) => {
  const found = blocksOf(markdown, heading)[at];
  if (found === undefined) throw new Error(`no block of code number ${at + 1} under « ${heading} »`);
  return found.text;
};

/** A figure the README gives, found in its text: the site does not hold a count of its own. */
const figureOf = (readme, pattern) => {
  const found = pattern.exec(readme.replace(/\s+/g, ' '))?.[1];
  if (found === undefined) throw new Error(`the README no longer says ${pattern}`);
  return found;
};

export const figures = () => {
  const readme = text('README.md');
  const found = (pattern, title, said) => {
    const value = figureOf(readme, pattern);
    return { value, title, label: said(value) };
  };
  return [
    found(/(\d+) for safe typing/, 'A value that is not what its type says', (count) => `${count} ways to write one were found. All are blocked.`),
    found(/(\d+) for errors in the types/, 'A crash that no type announces', (count) => `${count} ways to cause one were found. All are blocked.`),
    found(/from 2 known ways refused to (\d+) in/, 'A function that changes your data without saying so', (count) => `${count} ways are blocked so far. We still find new ones: this part is not finished.`),
  ];
};

/** The ideas of the tour: a heading of a document, and what the front page says before its sample. */
const TOUR = [
  { source: 'docs/getting-started.md', heading: 'What it looks like', file: 'invoice.ts', title: 'Nothing unchecked outside unsafe', text: 'A cast asserts a shape and proves nothing. The call that may throw goes to an unsafe directory, and a schema proves the shape.' },
  { source: 'examples/README.md', heading: 'report: five ways to throw that no type announces', file: 'report.ts', title: 'Errors are in the types', text: 'What throws without saying so is refused where it is called: `JSON.parse`, a pattern, a division of bigints.' },
  { source: 'examples/README.md', heading: 'cart: who changes what', file: 'cart.ts', title: 'Read-only, unless it says Mut', text: 'A function changes only what it made, or what says `Mut<T>` in its signature.' },
  { source: 'examples/README.md', heading: 'transfer: a transaction with one owner', file: 'transfer.ts', title: 'One owner, given away once', text: 'A value typed `Once<T>` has one owner. Forgotten on a path, or used after it was given away, it is refused.' },
];

/** A sample of the tour: the first block of TypeScript under its heading, and what was printed for it when the next block says it. */
const idea = (one) => {
  const blocks = blocksOf(text(one.source), one.heading);
  const at = blocks.findIndex((block) => block.language === 'ts');
  if (at === -1) throw new Error(`no block of TypeScript under « ${one.heading} »`);
  const said = blocks[at + 1]?.language === '' ? blocks[at + 1].text : undefined;
  return { ...one, to: `${PAGES.get(one.source)}#${slug(one.heading)}`, source: blocks[at].text, said };
};

/** Every file of the site: its path, and its text or its bytes. */
export const buildSite = async () => {
  const files = new Map();
  const mark = text('assets/mark.svg').trim();
  const chrome = { mark, commit: commitOf() };

  const readme = text('README.md');
  const fromReadme = linker({ from: 'README.md', out: 'index.html', pages: PAGES });
  const questions = sectionOf(readme, 'Frequently asked questions')
    .split(/^### /m)
    .slice(1)
    .map((question) => ({ title: inline(question.slice(0, question.indexOf('\n'))), html: render(question.slice(question.indexOf('\n')), fromReadme).html }));
  const engine = await engineScript();
  const playground = await parts();
  const environment = collect(ts).data.env;
  const body = home({
    demos: await demos(engine),
    // The compiler, what a file is compiled against, then the checker: what the page loads when a sample is changed.
    engine: ['assets/typescript.js', 'assets/environment.js', 'assets/engine.js'],
    run: { install: blockOf(readme, 'Installation and usage', 0), command: blockOf(readme, 'Installation and usage', 1), printed: blockOf(readme, 'Installation and usage', 2), configuration: blockOf(readme, 'Configuration') },
    adopt: blockOf(text('docs/adopting.md'), 'The baseline'),
    guarantees: render(sectionOf(readme, 'The five guarantees'), fromReadme).html,
    questions,
    inline,
    rules: rules.map((rule) => rule.name),
    figures: figures(),
    tour: TOUR.map(idea),
  });
  files.set('index.html', page({ ...chrome, title: 'strict-ts: catch the bugs TypeScript lets through', description: 'A checker you run in place of tsc --noEmit. It refuses TypeScript that compiles and still fails when it runs: any, casts, null, hidden exceptions.', base: '', active: 'home', body, kind: 'home' }));

  const found = [];
  const titles = DOCS.map((doc) => render(text(doc.source)).title);
  DOCS.forEach((doc, index) => files.set(doc.out, document(doc, index, titles, chrome, found)));
  for (const name of EXAMPLES) files.set(exampleOut(name), example(name, titles, chrome));
  // What the search looks into, as a script: a page opened from the disk may not fetch a file.
  files.set('assets/search.js', `globalThis.StrictTsSearch=${JSON.stringify(found).replaceAll('<', '\\u003c')};\n`);

  // The playground: a page of the site, under its bar. What `packages/playground` hands over is in a shadow tree, so
  // that its sheet and the site's do not meet; the tree is told the theme before it is painted.
  const play = `<main class="play" id="${HOST}"><template shadowrootmode="open">${playground.fragment}</template></main>
<script>document.getElementById('${HOST}').dataset.theme=document.documentElement.dataset.theme??''</script>
<script id="${DATA}" type="application/json">${playground.data}</script>`;
  files.set(PLAYGROUND, page({ ...chrome, title: 'Playground · strict-ts', description: 'strict-ts in a page: change a program, and read what is refused and why.', base: '', active: 'playground', body: play, kind: 'app', scripts: ['assets/typescript.js', 'assets/playground.js'] }));
  files.set('assets/typescript.js', readFileSync(playground.compiler));
  files.set('assets/playground.js', playground.script);

  const lost = `<main class="lost"><p class="eyebrow">404</p><h1>This is not a page of the site.</h1><p>Nothing answers at this address. The pages that are:</p><p class="actions"><a class="button main" href="index.html">The front page</a><a class="button" href="docs/getting-started.html">The documentation</a><a class="button" href="${PLAYGROUND}">The playground</a></p></main>`;
  // It is shown under any address that is not a page: its own addresses start at the root of the site.
  files.set('404.html', page({ ...chrome, title: 'Not a page · strict-ts', description: 'This address is not a page of the site.', base: '/', active: 'none', body: lost }));

  files.set('assets/site.js', await script({ entryPoints: [`${root}src/client.js`] }));
  // The checker, for the sample of the front page, and what it compiles a file against: asked for when the sample
  // is changed, not before.
  files.set('assets/engine.js', engine);
  files.set('assets/environment.js', `globalThis.StrictTsEnvironment=${JSON.stringify({ environment, flags: allFlags }).replaceAll('<', '\\u003c')};\n`);
  files.set('assets/site.css', readFileSync(`${root}src/style.css`, 'utf8'));
  files.set('assets/mark.svg', `${mark}\n`);
  files.set('assets/logo.svg', text('assets/logo.svg'));
  for (const name of readdirSync(`${repo}assets`).filter((file) => file.endsWith('.png'))) files.set(`assets/${name}`, readFileSync(`${repo}assets/${name}`));
  return files;
};
