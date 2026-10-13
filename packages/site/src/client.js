// What the pages do once they are shown: the theme, the search, the blocks of code that can be copied, and the
// sample of the front page, which the checker judges again as it is changed. No rule is here: the checker is asked.
import { tokens } from './tokens.js';

const root = document.documentElement;
document.querySelector('[data-theme-toggle]')?.addEventListener('click', () => {
  const now = root.dataset.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  root.dataset.theme = now === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem('strict-ts-theme', root.dataset.theme);
  } catch {
    // A page that may not keep anything is light or dark until it is closed.
  }
});

const element = (tag, className, text) => {
  const made = document.createElement(tag);
  if (className !== undefined) made.className = className;
  if (text !== undefined) made.textContent = text;
  return made;
};

// A block of code of a document can be copied.
for (const block of document.querySelectorAll('.prose pre.code')) {
  const copy = element('button', 'copy', 'Copy');
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(block.querySelector('code').textContent);
      copy.textContent = 'Copied';
    } catch {
      copy.textContent = 'Not copied';
    }
    setTimeout(() => (copy.textContent = 'Copy'), 1400);
  });
  block.append(copy);
}

// « On this page » says which section is being read.
const here = [...document.querySelectorAll('.here a')];
if (here.length > 0 && 'IntersectionObserver' in globalThis) {
  const byId = new Map(here.map((link) => [decodeURIComponent(link.hash.slice(1)), link]));
  const seen = new Set();
  const watcher = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) seen.add(entry.target.id);
        else seen.delete(entry.target.id);
      }
      // The first heading in view, in the order of the page.
      const first = [...byId.keys()].find((id) => seen.has(id));
      if (first === undefined) return;
      for (const link of here) link.removeAttribute('aria-current');
      byId.get(first).setAttribute('aria-current', 'true');
    },
    { rootMargin: '-70px 0px -60% 0px' },
  );
  for (const id of byId.keys()) {
    const heading = document.getElementById(id);
    if (heading !== null) watcher.observe(heading);
  }
}

// The search: every section of the documentation, looked into in the page. What it looks into is loaded when it
// is first opened.
const search = document.querySelector('[data-search]');
if (search !== null && typeof search.showModal === 'function') {
  const input = search.querySelector('input');
  const results = search.querySelector('[data-results]');
  const hint = search.querySelector('[data-hint]');
  const base = root.dataset.base ?? '';
  let index;
  let chosen = 0;
  let asked = 0;

  const loadIndex = () => {
    index ??= new Promise((resolve, reject) => {
      const tag = element('script');
      tag.src = search.dataset.index;
      tag.addEventListener('load', () => resolve(globalThis.StrictTsSearch.map((piece) => ({ ...piece, low: `${piece.heading} ${piece.text}`.toLowerCase(), lowHeading: piece.heading.toLowerCase() }))));
      tag.addEventListener('error', () => reject(new Error('the search could not be loaded')));
      document.head.append(tag);
    });
    return index;
  };

  /** A piece of text around the first place a word is found, with every word found marked. */
  const excerpt = (text, wanted) => {
    const low = text.toLowerCase();
    const at = Math.max(0, Math.min(...wanted.map((word) => low.indexOf(word)).filter((found) => found !== -1), text.length) - 50);
    const shown = `${at > 0 ? '…' : ''}${text.slice(at, at + 170)}${at + 170 < text.length ? '…' : ''}`;
    const made = element('span', 'excerpt');
    const pattern = new RegExp(`(${wanted.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    for (const [position, part] of shown.split(pattern).entries()) made.append(position % 2 === 1 ? element('mark', undefined, part) : part);
    return made;
  };

  const choose = (to) => {
    const items = [...results.children];
    if (items.length === 0) return;
    chosen = (to + items.length) % items.length;
    for (const [position, item] of items.entries()) item.firstElementChild.setAttribute('aria-selected', String(position === chosen));
    items[chosen].scrollIntoView({ block: 'nearest' });
  };

  const answer = async () => {
    const wanted = input.value.toLowerCase().split(/\s+/).filter((word) => word !== '');
    asked += 1;
    const mine = asked;
    if (wanted.length === 0) {
      results.replaceChildren();
      hint.hidden = false;
      return;
    }
    let pieces;
    try {
      pieces = await loadIndex();
    } catch (cause) {
      hint.hidden = false;
      hint.textContent = cause instanceof Error ? cause.message : String(cause);
      return;
    }
    // An answer to what was typed before the last key is not shown.
    if (mine !== asked) return;
    results.replaceChildren();
    const found = pieces
      .filter((piece) => wanted.every((word) => piece.low.includes(word)))
      .map((piece) => ({ piece, score: wanted.reduce((sum, word) => sum + (piece.lowHeading === word ? 30 : piece.lowHeading.includes(word) ? 10 : 0) + Math.min(piece.low.split(word).length - 1, 5), 0) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
    hint.hidden = found.length > 0;
    if (found.length === 0) hint.textContent = 'Nothing in the documentation says that.';
    for (const { piece } of found) {
      const link = element('a');
      link.href = `${base}${piece.to}`;
      link.append(element('strong', undefined, piece.heading), element('small', undefined, piece.page), excerpt(piece.text, wanted));
      const item = element('li');
      item.append(link);
      results.append(item);
    }
    choose(0);
  };

  const open = () => {
    if (search.open) return;
    search.showModal();
    input.select();
    loadIndex().catch(() => {});
  };
  for (const opener of document.querySelectorAll('[data-search-open]')) opener.addEventListener('click', open);
  document.addEventListener('keydown', (event) => {
    const typing = event.target instanceof HTMLElement && (event.target.matches('input, textarea, select') || event.target.isContentEditable);
    if ((event.key === '/' && !typing) || (event.key === 'k' && (event.metaKey || event.ctrlKey))) {
      event.preventDefault();
      open();
    }
  });
  input.addEventListener('input', answer);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      choose(chosen + (event.key === 'ArrowDown' ? 1 : -1));
    }
    if (event.key === 'Enter') results.children[chosen]?.firstElementChild.click();
  });
  // A click beside the box closes it; a link to a section of the page that is open does too.
  search.addEventListener('click', (event) => {
    if (event.target === search || (event.target instanceof Element && event.target.closest('a') !== null)) search.close();
  });
}

const host = document.querySelector('[data-demo]');
if (host !== null) {
  const demos = JSON.parse(host.querySelector('[data-demos]').textContent);
  const source = host.querySelector('textarea');
  const paint = host.querySelector('.paint');
  const marks = host.querySelector('.marks');
  const verdict = host.querySelector('.verdict');
  const note = host.querySelector('[data-note]');
  const tabs = [...host.querySelectorAll('[data-tab]')];
  const versions = [...host.querySelectorAll('[data-version]')];
  const state = { demo: 0, version: 'refused', asked: 0 };

  // What the checker said of each sample when the site was built: the checker is loaded when a text is changed.
  const known = new Map(demos.flatMap((demo) => [[`${demo.name}\n${demo.refused.source}`, demo.refused.diagnostics], [`${demo.name}\n${demo.fixed.source}`, demo.fixed.diagnostics]]));
  const script = (address) =>
    new Promise((resolve, reject) => {
      const tag = element('script');
      tag.src = address;
      tag.addEventListener('load', resolve);
      tag.addEventListener('error', () => reject(new Error('the checker could not be loaded')));
      document.head.append(tag);
    });
  let engine;
  // The compiler, what a file is compiled against, then the checker: each is a script of the site, loaded in turn.
  const loaded = () => {
    engine ??= (async () => {
      for (const address of host.dataset.engine.split(' ')) await script(address);
      const { environment, flags } = globalThis.StrictTsEnvironment;
      return globalThis.StrictTsEngine.create(globalThis.ts, environment, flags);
    })();
    return engine;
  };

  const follow = () => {
    for (const layer of [paint, marks]) {
      layer.scrollTop = source.scrollTop;
      layer.scrollLeft = source.scrollLeft;
    }
  };

  const colour = () => {
    paint.replaceChildren(...tokens(source.value).map((piece) => (piece.kind === undefined ? piece.text : element('span', piece.kind, piece.text))), '\n');
    follow();
  };

  const show = (text, diagnostics) => {
    marks.replaceChildren();
    let at = 0;
    const spans = diagnostics.filter((diagnostic) => diagnostic.start !== undefined).map(({ start, end }) => ({ start, end: Math.max(end, start + 1) }));
    for (const span of spans.sort((a, b) => a.start - b.start)) {
      if (span.start < at) continue;
      marks.append(text.slice(at, span.start), element('mark', undefined, text.slice(span.start, span.end) || ' '));
      at = span.end;
    }
    marks.append(`${text.slice(at)}\n`);
    verdict.replaceChildren(...(diagnostics.length === 0 ? [element('p', 'fine', '✓ Nothing is refused.')] : diagnostics.map((diagnostic) => element('pre', 'refusal', diagnostic.text))));
    follow();
  };

  const judge = async () => {
    const text = source.value;
    const { name } = demos[state.demo];
    state.asked += 1;
    const asked = state.asked;
    let diagnostics = known.get(`${name}\n${text}`);
    if (diagnostics === undefined) {
      if (engine === undefined) verdict.replaceChildren(element('p', 'note', 'Loading the checker…'));
      try {
        diagnostics = (await loaded()).judge(name, text);
      } catch (cause) {
        if (asked === state.asked) verdict.replaceChildren(element('p', 'note', `${cause instanceof Error ? cause.message : String(cause)}: the playground has it inside.`));
        return;
      }
    }
    // An answer to a text that was changed since is not shown.
    if (asked === state.asked) show(text, diagnostics);
  };

  const choose = () => {
    const demo = demos[state.demo];
    for (const tab of tabs) tab.setAttribute('aria-selected', String(Number(tab.dataset.tab) === state.demo));
    for (const version of versions) version.setAttribute('aria-pressed', String(version.dataset.version === state.version));
    note.innerHTML = demo.note;
    source.value = demo[state.version].source;
    source.scrollTop = 0;
    colour();
    judge();
  };

  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      state.demo = Number(tab.dataset.tab);
      state.version = 'refused';
      choose();
    });
  }
  for (const version of versions) {
    version.addEventListener('click', () => {
      state.version = version.dataset.version;
      choose();
    });
  }

  let pending;
  source.addEventListener('input', () => {
    for (const version of versions) version.setAttribute('aria-pressed', 'false');
    colour();
    clearTimeout(pending);
    pending = setTimeout(judge, 250);
  });
  source.addEventListener('scroll', follow);
  // The checker is on its way as soon as the sample is entered, before the first key.
  source.addEventListener('focus', () => loaded().catch(() => {}), { once: true });
}
