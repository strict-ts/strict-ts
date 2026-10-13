// The front page, for someone who never heard of strict-ts: what it does beside a sample the checker judges, how we
// know it works, how it is used in three steps, what it gives, what it refuses, the examples, how it is run, what
// comes with it, and what is claimed and what is not.
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

/** The three steps of using it, as someone who never saw it reads them. */
const STEPS = [
  { title: 'Run one command', text: '<code>npx strict-ts -p .</code>, where <code>tsc --noEmit</code> ran. It reports the errors of the compiler, and adds its own.' },
  { title: 'Read what it refuses', text: 'One line per problem, with the file and the place, and a <code>help:</code> line that says what to write instead.' },
  { title: 'Fix it, or fence it off', text: 'Make the code conform, or move what cannot to an <code>unsafe/</code> directory, with a reason. On existing code, a baseline lets you start today: only new problems fail.' },
];

const WHAT = [
  { title: 'Types that tell the truth', glyph: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2.2 2.4L15.5 9.5"/>', text: 'No <code>any</code>, no cast, no <code>@ts-ignore</code>: a value is what its type says it is.' },
  { title: 'Errors you cannot forget', glyph: '<path d="M12 3.5l9 16H3z"/><path d="M12 10v4.5M12 17.2v.3"/>', text: 'No <code>throw</code>, no <code>null</code>: what may fail returns a <code>Result</code>. A call that throws without saying so, like <code>JSON.parse</code>, is caught where it is written.' },
  { title: 'No change behind your back', glyph: '<path d="M4 6h16v12H4z"/><path d="M7.5 10l2.5 2-2.5 2M12.5 14.5h4"/>', text: 'Data is read-only unless a signature says <code>Mut&lt;T&gt;</code>: the call shows what a function may change. This part is still in progress.' },
  { title: 'Still plain TypeScript', glyph: '<path d="M8 4H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h1M16 4h1a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-1"/>', text: 'No new language and no new compiler: <code>tsc</code> builds the same JavaScript. What you write with is an ordinary library.' },
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

export const home = ({ demos, engine, run, adopt, guarantees, questions, inline, rules, figures, tour }) => `
<section class="hero">
  <div class="hero-in">
    <div class="pitch">
      <h1>Catch the bugs <strong>TypeScript lets through.</strong></h1>
      <p class="sub">strict-ts is a checker you run in place of <code>tsc --noEmit</code>. It refuses code that compiles and still fails when it runs: <code>any</code>, casts, <code>null</code>, hidden exceptions, data changed behind your back. Your code stays standard TypeScript.</p>
      <div class="actions">
        <a class="button main" href="${PLAYGROUND}">Try strict-ts now<small>In your browser</small></a>
        <a class="button" href="docs/getting-started.html">Get started<small>In a project</small></a>
      </div>
      <p class="status after"><a href="docs/known-limits.html"><b>Where it stands:</b> typing and errors have no known hole. Mutability and ownership are in progress. <span>→</span></a></p>
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
    <div class="measure">
      <p class="about"><b>Does it work? We try to fool it.</b> We write TypeScript that compiles without a warning and still goes wrong when it runs. Each trick that got past strict-ts became a rule that blocks it. The score so far:</p>
      <dl>
        ${figures.map((figure) => `<div><dt>${figure.value}</dt><dd><b>${figure.title}</b>${figure.label}</dd></div>`).join('\n        ')}
      </dl>
    </div>
    <p>Blocking every trick we found does not prove there is no other. <a href="docs/known-limits.html">Known limits</a> says what is left.</p>
  </div>
</section>

<section>
  <div class="in">
    ${head('How it works', 'One command, where tsc ran')}
    <div class="cards three steps">
      ${STEPS.map((step, index) => `<div class="card"><b class="step">${index + 1}</b><h3>${step.title}</h3><p>${step.text}</p></div>`).join('\n      ')}
    </div>
  </div>
</section>

<section class="band">
  <div class="in">
    ${head('What you get', 'TypeScript, as safe as Rust')}
    <div class="cards four">
      ${WHAT.map((one) => `<div class="card">${icon(one.glyph)}<h3>${one.title}</h3><p>${one.text}</p></div>`).join('\n      ')}
    </div>
  </div>
</section>

<section>
  <div class="in split">
    <div>
      ${head('The rules', `What it refuses, in ${rules.length} rules`, 'Each rule names one way a TypeScript program goes wrong, and says what to write instead. What you write instead comes from an ordinary library.')}
      <p class="more"><a href="docs/rules.html">The rules →</a></p>
    </div>
    <div class="words">
      <ul class="gone" aria-label="The rules of strict-ts">${rules.map((rule) => `<li><code>${escape(rule)}</code></li>`).join('')}</ul>
      <ul class="kept" aria-label="What conforming code is written with"><li><code>Result</code></li><li><code>Option</code></li><li><code>Mut&lt;T&gt;</code></li><li><code>Once&lt;T&gt;</code></li><li><code>unsafe/</code></li></ul>
    </div>
  </div>
</section>

<section class="band">
  <div class="in">
    ${head('A tour', `See it on ${tour.length} small programs`, 'Each is TypeScript that <code>tsc --strict</code> accepts, with what strict-ts says of it. The links lead to the same program once it conforms.')}
    <div class="tour">
      ${tour.map((idea) => `<article><div><h3>${idea.title}</h3><p>${inline(idea.text)}</p><a href="${idea.to}">${escape(idea.heading)} →</a></div>${code(idea.file, idea.source)}${idea.said === undefined ? '' : `<pre class="refusal">${escape(idea.said)}</pre>`}</article>`).join('\n      ')}
    </div>
  </div>
</section>

<section>
  <div class="in">
    ${head('In a project', 'Three things to know: install, run, configure', 'How it is installed, what it prints, and the one file that configures it.')}
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
    ${head('Around it', 'What comes with it', 'Each document says what was tried, and what was not.')}
    <div class="cards four">
      ${FITS.map((fit) => `<a class="card go" href="${fit.to}"><h3>${fit.name}</h3><p>${fit.text}</p></a>`).join('\n      ')}
    </div>
  </div>
</section>

<section>
  <div class="in">
    ${head('The scoreboard', 'The five guarantees of Rust, and where each stands')}
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
    <h2>Try to get a bug past it.</h2>
    <p>Write TypeScript that compiles and fails when it runs, and see whether strict-ts lets it through. The checker is in the page, and nothing is sent anywhere.</p>
    <div class="actions">
      <a class="button main" href="${PLAYGROUND}">Open the playground</a>
      <a class="button" href="docs/rules.html">Read the rules</a>
    </div>
  </div>
</section>
`;
