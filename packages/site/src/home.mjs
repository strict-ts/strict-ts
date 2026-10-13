// The front page, in the order of typescriptlang.org: what strict-ts is beside a sample the checker judges, what it
// is in a few cards, what it refuses, how to start, the examples, how it is run, where it fits, and what is claimed
// and what is not.
import { PLAYGROUND } from './layout.mjs';
import { escape, paint } from './markdown.mjs';

/** What the checker said of a sample, as the command line prints it. */
export const verdict = (diagnostics) =>
  diagnostics.length === 0
    ? '<p class="fine">✓ Nothing is refused.</p>'
    : diagnostics.map((diagnostic) => `<pre class="refusal">${escape(diagnostic.text)}</pre>`).join('');

/** The source with what is refused marked: the layer behind the editor. */
export const marks = (source, diagnostics) => {
  let at = 0;
  let html = '';
  const spans = diagnostics.filter((diagnostic) => diagnostic.start !== undefined).map(({ start, end }) => ({ start, end: Math.max(end, start + 1) }));
  for (const span of spans.sort((a, b) => a.start - b.start)) {
    if (span.start < at) continue;
    html += `${escape(source.slice(at, span.start))}<mark>${escape(source.slice(span.start, span.end) || ' ')}</mark>`;
    at = span.end;
  }
  return `${html}${escape(source.slice(at))}\n`;
};

/**
 * A text on the one surface the site shows code on, under a name. `painted` says it is code: what a command printed
 * is shown as it is.
 */
export const code = (name, source, { painted = true } = {}) => `<figure class="window"><figcaption><span>${escape(name)}</span></figcaption><pre class="code"><code>${painted ? paint(source) : escape(source)}</code></pre></figure>`;

const icon = (path) => `<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;

const WHAT = [
  { title: 'A checker, not a language', glyph: '<path d="M8 4H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h1M16 4h1a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-1"/>', text: 'The code stays standard TypeScript that <code>tsc</code> compiles as is, and the JavaScript that comes out is the same.' },
  { title: 'In place of tsc --noEmit', glyph: '<path d="M4 6h16v12H4z"/><path d="M7.5 10l2.5 2-2.5 2M12.5 14.5h4"/>', text: 'One command in the CI: it reports the errors of the compiler and adds its own rules, one line per refusal with what to write instead.' },
  { title: 'Unsafe has one place', glyph: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2.2 2.4L15.5 9.5"/>', text: 'A cast, <code>any</code>, <code>throw</code> or an external import live in the unsafe directories, each with a <code>// SAFETY:</code> reason. No comment silences a rule.' },
  { title: 'Not sure means refused', glyph: '<path d="M12 3.5l9 16H3z"/><path d="M12 10v4.5M12 17.2v.3"/>', text: 'An analysis that is not sure refuses the code. It never declares it safe.' },
];

const FITS = [
  { name: 'The command line', to: 'docs/cli.html', text: 'Text, JSON and SARIF. The exit code is 0 when nothing is refused, 1 when something is.' },
  { name: 'Existing code', to: 'docs/adopting.html#the-baseline', text: 'A baseline records what is refused today: the gate fails only on what is new, and a fixer applies the fixes that are mechanical.' },
  { name: 'Unsafe directories', to: 'docs/unsafe-directories.html', text: 'Where what cannot conform lives, and what such a directory may hand to the rest.' },
  { name: 'The standard library', to: 'docs/standard-library.html', text: '<code>Result</code>, <code>Option</code>, schemas, <code>Mut</code>, <code>Once</code>: an ordinary library, which does not depend on the checker.' },
  { name: 'Editors', to: 'docs/editor.html', text: 'The refusals where they are written, through a plugin of the TypeScript server.' },
  { name: 'Probes', to: 'docs/probes.html', text: 'The tests run on instrumented code: what the gate took on trust is checked as the program runs.' },
  { name: 'What throws', to: 'docs/what-throws.html', text: 'A ledger of what each function of the language and of the DOM throws, made by running them.' },
  { name: 'Packages', to: 'docs/packages.html', text: 'What each package is for, and the state it is in.' },
];

const head = (eyebrow, title, lead = '') => `<header class="head"><p class="eyebrow">${eyebrow}</p><h2>${title}</h2>${lead === '' ? '' : `<p class="lead">${lead}</p>`}</header>`;

export const home = ({ demos, engine, run, adopt, guarantees, questions, inline, rules, figures, tour, scenarios }) => `
<section class="hero">
  <div class="hero-in">
    <div class="pitch">
      <p class="status"><a href="docs/known-limits.html"><b>Two guarantees are « Acquired ».</b> It is a list of attacks and not a proof. <span>→</span></a></p>
      <h1>strict-ts makes TypeScript <strong>as safe as Rust.</strong></h1>
      <p class="sub">A program it accepts must not be able to fail for a reason its types do not announce. It is a checker, not a language: the code stays standard TypeScript.</p>
      <div class="actions">
        <a class="button main" href="${PLAYGROUND}">Try strict-ts now<small>In your browser</small></a>
        <a class="button" href="docs/getting-started.html">Get started<small>In a project</small></a>
      </div>
    </div>
    <div class="window demo" data-demo data-engine="${engine.join(' ')}">
      <div class="tabs" role="tablist" aria-label="Samples">
        ${demos.map((demo, index) => `<button type="button" role="tab" data-tab="${index}" aria-selected="${index === 0}">${escape(demo.tab)}</button>`).join('')}
      </div>
      <div class="editor">
        <pre class="paint" aria-hidden="true">${paint(demos[0].refused.source)}\n</pre>
        <pre class="marks" aria-hidden="true">${marks(demos[0].refused.source, demos[0].refused.diagnostics)}</pre>
        <textarea spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="A sample of TypeScript: change it, and strict-ts says what it refuses">${escape(demos[0].refused.source)}</textarea>
      </div>
      <div class="verdict" aria-live="polite">${verdict(demos[0].refused.diagnostics)}</div>
      <div class="demo-foot">
        <p class="note" data-note>${inline(demos[0].note)}</p>
        <div class="versions">
          <button type="button" data-version="refused" aria-pressed="true">As tsc accepts it</button>
          <button type="button" data-version="fixed" aria-pressed="false">Conforming</button>
          <a href="${PLAYGROUND}">Open the playground →</a>
        </div>
      </div>
      <script type="application/json" data-demos>${JSON.stringify(demos.map((demo) => ({ ...demo, note: inline(demo.note) }))).replaceAll('<', '\\u003c')}</script>
    </div>
  </div>
</section>

<section class="figures" aria-label="The measure">
  <div class="in">
    <dl>
      ${figures.map((figure) => `<div><dt>${figure.value}</dt><dd>${figure.label}</dd></div>`).join('\n      ')}
    </dl>
    <p>It is a list and not a proof. <a href="docs/known-limits.html">Known limits</a> says what is taken on trust, and what is still accepted.</p>
  </div>
</section>

<section>
  <div class="in">
    ${head('The idea', 'What is strict-ts?')}
    <div class="cards four">
      ${WHAT.map((one) => `<div class="card">${icon(one.glyph)}<h3>${one.title}</h3><p>${one.text}</p></div>`).join('\n      ')}
    </div>
  </div>
</section>

<section class="band">
  <div class="in split">
    <div>
      ${head('The rules', `${rules.length} rules, and what conforming code says instead`, 'Each refuses where the code is written, with a line that says what to write. What stands in their place is an ordinary library.')}
      <p class="more"><a href="docs/rules.html">The rules →</a></p>
    </div>
    <div class="words">
      <ul class="gone" aria-label="The rules of strict-ts">${rules.map((rule) => `<li><code>${escape(rule)}</code></li>`).join('')}</ul>
      <ul class="kept" aria-label="What conforming code is written with"><li><code>Result</code></li><li><code>Option</code></li><li><code>Mut&lt;T&gt;</code></li><li><code>Once&lt;T&gt;</code></li><li><code>unsafe/</code></li></ul>
    </div>
  </div>
</section>

<section>
  <div class="in">
    ${head('Start', 'Get started')}
    <div class="cards three">
      <a class="card go" href="docs/rules.html"><h3>The rules</h3><p>What each rule refuses, by the guarantee it serves.</p><span>Read them →</span></a>
      <a class="card go" href="${PLAYGROUND}"><h3>Playground</h3><p>The checker in a page, with ${scenarios} scenarios to change. Nothing is sent anywhere.</p><span>Try it in your browser →</span></a>
      <a class="card go" href="docs/getting-started.html"><h3>In a project</h3><p>Where <code>tsc --noEmit</code> ran, with Node 22.13 or later and a <code>tsconfig.json</code>.</p><span>Get started →</span></a>
    </div>
  </div>
</section>

<section class="band">
  <div class="in">
    ${head('A tour', `Four guarantees, in ${tour.length} examples`, 'Each sample is the one of a document, where the rest is said. The examples are written twice: as <code>tsc --strict</code> accepts them, and conforming.')}
    <div class="tour">
      ${tour.map((idea) => `<article><div><h3>${idea.title}</h3><p>${inline(idea.text)}</p><a href="${idea.to}">${escape(idea.heading)} →</a></div>${code(idea.file, idea.source)}${idea.said === undefined ? '' : `<pre class="refusal">${escape(idea.said)}</pre>`}</article>`).join('\n      ')}
    </div>
  </div>
</section>

<section>
  <div class="in">
    ${head('In a project', 'It runs where tsc --noEmit ran', 'These are the blocks of the README: how it is installed, what it prints, and the one file that configures it.')}
    <div class="becomes">
      ${code('install', run.install, { painted: false })}
      ${code('check', `$ ${run.command}\n\n${run.printed}`, { painted: false })}
      ${code('strict-ts.json', run.configuration)}
    </div>
    <div class="adopt">
      <div>
        <h3>Adopt it on code that was not written for it</h3>
        <p>A baseline records what is refused today, as a count per rule per file. From then on the gate fails only on what goes beyond the record, and the record can only shrink.</p>
        <p><a href="docs/adopting.html">Adopting it on existing code</a> says what that costs, measured on applications.</p>
      </div>
      ${code('baseline', adopt, { painted: false })}
    </div>
  </div>
</section>

<section class="band">
  <div class="in">
    ${head('Around it', 'Where it fits', 'Adapters around the one rule engine, with no rule in them. Each document says what was tried, and what was not.')}
    <div class="cards four">
      ${FITS.map((fit) => `<a class="card go" href="${fit.to}"><h3>${fit.name}</h3><p>${fit.text}</p></a>`).join('\n      ')}
    </div>
  </div>
</section>

<section>
  <div class="in">
    ${head('The scoreboard', 'The five guarantees')}
    <div class="prose scoreboard">${guarantees}</div>
  </div>
</section>

<section class="band">
  <div class="in narrow">
    ${head('Asked', 'Frequently asked questions')}
    <div class="faq">
      ${questions.map((question) => `<details><summary>${question.title}</summary><div class="prose">${question.html}</div></details>`).join('\n      ')}
    </div>
  </div>
</section>

<section class="closing">
  <div class="in">
    <h2>Try to write a failure its types do not announce.</h2>
    <p>The checker is in the page, and nothing is sent anywhere.</p>
    <div class="actions">
      <a class="button main" href="${PLAYGROUND}">Open the playground</a>
      <a class="button" href="docs/rules.html">Read the rules</a>
    </div>
  </div>
</section>
`;
