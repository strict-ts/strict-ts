// What every page of the site has around its text: the head, the bar at the top, the search, the foot. The foot
// names the repository; nothing else of the site leads there.
import { escape } from './markdown.mjs';

export const REPOSITORY = 'https://git.cf.adserver.fr/Alex/strict-ts';
export const PLAYGROUND = 'playground.html';

/** The bar at the top: the entries of typescriptlang.org, for what this project has. */
export const nav = (base, active) => NAV.map((entry) => `<a href="${base}${entry.to}"${entry.key === active ? ' aria-current="page"' : ''}>${entry.label}</a>`);

const NAV = [
  { key: 'docs', label: 'Docs', to: 'docs/getting-started.html' },
  { key: 'rules', label: 'The rules', to: 'docs/rules.html' },
  { key: 'playground', label: 'Playground', to: PLAYGROUND },
  { key: 'examples', label: 'Examples', to: 'docs/examples.html' },
  { key: 'tools', label: 'Tools', to: 'docs/cli.html' },
  { key: 'limits', label: 'Known limits', to: 'docs/known-limits.html' },
];

// Before the first paint, so that a page chosen dark does not flash light.
const THEME = `try{var t=localStorage.getItem('strict-ts-theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}`;

const ICONS = {
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  theme: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" stroke="none"/></svg>',
};

const brand = (base, mark) => `<a class="brand" href="${base}index.html"><span class="mark">${mark}</span><span>strict<b>-ts</b></span></a>`;

/**
 * A page. `base` is the way from the page to the root of the site (`''` or `'../'`): every address is relative, so
 * the site works from a folder and under any address. `kind` is `home`, `doc`, `app` (the playground: the page is
 * as high as the window, and has no foot) or `plain`.
 */
export const page = ({ title, description, base, active, body, mark, commit, kind = 'plain', scripts = [] }) => `<!doctype html>
<html lang="en" data-base="${base}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
<meta name="theme-color" content="#14181d">
<link rel="icon" href="${base}assets/mark.svg" type="image/svg+xml">
<script>${THEME}</script>
<link rel="stylesheet" href="${base}assets/site.css">
</head>
<body class="k-${kind}">
<a class="skip" href="#content">Skip to the text</a>
<header class="top">
  <div class="top-in">
    ${brand(base, mark)}
    <nav aria-label="Site">
      ${nav(base, active).join('\n      ')}
    </nav>
    <div class="top-end">
      <button type="button" class="find" data-search-open aria-label="Search the documentation">${ICONS.search}<span>Search</span><kbd>/</kbd></button>
      <button type="button" class="icon" data-theme-toggle aria-label="Switch between the light and the dark theme" title="Light or dark">${ICONS.theme}</button>
    </div>
  </div>
</header>
<div id="content">
${body}
</div>
${
  kind === 'app'
    ? ''
    : `<footer class="foot">
  <div class="foot-in">
    <div class="foot-about">
      ${brand(base, mark)}
      <p>TypeScript and JavaScript as safe as Rust, without a new language or compiler.</p>
      <p>Under the MIT license. It rests on lists of attacks, not on proofs.</p>
      <p class="built">Built from commit ${escape(commit)}. This site loads nothing from elsewhere.</p>
    </div>
    <div>
      <h2>Using strict-ts</h2>
      <a href="${base}docs/getting-started.html">Getting started</a>
      <a href="${base}docs/rules.html">The rules</a>
      <a href="${base}docs/standard-library.html">The standard library</a>
      <a href="${base}${PLAYGROUND}">Playground</a>
      <a href="${base}docs/examples.html">Examples</a>
    </div>
    <div>
      <h2>Tools</h2>
      <a href="${base}docs/cli.html">The command line</a>
      <a href="${base}docs/configuration.html">Configuration</a>
      <a href="${base}docs/adopting.html">On existing code</a>
      <a href="${base}docs/editor.html">In the editor</a>
      <a href="${base}docs/packages.html">Packages</a>
    </div>
    <div>
      <h2>The project</h2>
      <a href="${base}docs/known-limits.html">Known limits</a>
      <a href="${base}docs/contributing.html">Contributing</a>
      <a href="${base}docs/changelog.html">Changelog</a>
      <a href="${REPOSITORY}" rel="noopener">Repository</a>
      <a href="https://strict-script.adserver.fr/" rel="noopener">strict-script, its sibling</a>
    </div>
  </div>
</footer>`
}
<dialog class="search" data-search data-index="${base}assets/search.js" aria-label="Search the documentation">
  <div class="search-field">${ICONS.search}<input type="search" placeholder="Search the documentation" aria-label="Search the documentation" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></div>
  <ol data-results></ol>
  <p class="search-hint" data-hint>Type a rule, a word of the library, a command: <code>no-cast</code>, <code>Result</code>, <code>baseline</code>.</p>
</dialog>
<script src="${base}assets/site.js" defer></script>
${scripts.map((script) => `<script src="${base}${script}" defer></script>`).join('\n')}
</body>
</html>
`;
