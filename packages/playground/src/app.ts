// The page: an explorer, an editor and rustc-style diagnostics around the engine. It decides nothing about the code.
import type { Diagnostic } from '@strict-ts/core';
import type ts from '@typescript/typescript6';
import { createPlayground, type Environment, type Outcome, type Playground, STD_NAME } from './engine.js';

interface Scenario {
  readonly id: string;
  readonly label: string;
  readonly intro: string;
  readonly flags: Readonly<Record<string, boolean>>;
  readonly files: Readonly<Record<string, string>>;
}

interface Data {
  readonly tsVersion: string;
  readonly scenarios: readonly Scenario[];
  readonly env: Environment;
}

interface Workspace {
  files: Record<string, string>;
  active: string;
  flags: Record<string, boolean>;
  unsafeDirs: string;
  allowedImports: string;
  disabled: string[];
}

type Tab = 'problems' | 'rules' | 'config';

interface State {
  scenario: string;
  workspaces: Record<string, Workspace>;
  tab: Tab;
  filter: string | undefined;
}

declare const DATA: Data;
declare const COMPILER: typeof ts | undefined;

const STORE = 'strict-ts-playground-v3';
const STD_PREFIX = `${STD_NAME}/`;

const $ = (id: string): HTMLElement => document.getElementById(id) ?? document.body;
const esc = (text: string): string =>
  text.replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));
const split = (list: string): string[] =>
  list
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`;
const message = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

let playground: Playground | undefined;
let outcome: Outcome | undefined;
let failure: string | undefined;
let checkTimer = 0;

// ── State ────────────────────────────────────────────
const scenarioById = (id: string): Scenario | undefined => DATA.scenarios.find((scenario) => scenario.id === id);

function freshWorkspace(scenario: Scenario | undefined): Workspace {
  const files = { ...scenario?.files };
  const depth = (path: string): number => path.split('/').length;
  const first = Object.keys(files).toSorted((a, b) => depth(a) - depth(b) || a.localeCompare(b))[0] ?? '';
  return {
    files,
    active: first,
    flags: { ...scenario?.flags },
    unsafeDirs: 'src/unsafe',
    allowedImports: STD_NAME,
    disabled: [],
  };
}

const state: State = { scenario: DATA.scenarios[0]?.id ?? '', workspaces: {}, tab: 'problems', filter: undefined };
try {
  const saved: unknown = JSON.parse(localStorage.getItem(STORE) ?? 'null');
  if (typeof saved === 'object' && saved !== null && 'scenario' in saved && 'workspaces' in saved) {
    const known = typeof saved.scenario === 'string' && scenarioById(saved.scenario) !== undefined;
    if (known) Object.assign(state, saved, { filter: undefined });
  }
} catch {
  // A storage that is blocked or holds something else: the page starts from the scenarios.
}

function workspace(): Workspace {
  const known = state.workspaces[state.scenario];
  if (known !== undefined) return known;
  const created = freshWorkspace(scenarioById(state.scenario));
  state.workspaces[state.scenario] = created;
  return created;
}

function save(): void {
  try {
    localStorage.setItem(STORE, JSON.stringify({ scenario: state.scenario, workspaces: state.workspaces, tab: state.tab }));
  } catch {
    // Nothing to do without storage: the edits live as long as the page.
  }
}

const isStd = (path: string): boolean => path.startsWith(STD_PREFIX);
const fileText = (path: string): string =>
  isStd(path) ? (DATA.env.std[path.slice(STD_PREFIX.length)] ?? '') : (workspace().files[path] ?? '');
const isUnsafePath = (path: string): boolean =>
  !isStd(path) && split(workspace().unsafeDirs).some((dir) => path.startsWith(`${dir.replace(/^\.?\/+|\/+$/g, '')}/`));
const diagnostics = (): readonly Diagnostic[] => outcome?.diagnostics ?? [];
const diagnosticsOf = (path: string): readonly Diagnostic[] => diagnostics().filter((d) => d.file === path);
const countsByRule = (): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const d of diagnostics()) counts.set(d.rule, (counts.get(d.rule) ?? 0) + 1);
  return counts;
};

// ── Checking ─────────────────────────────────────────
function runCheck(): void {
  if (playground === undefined) return;
  const current = workspace();
  try {
    outcome = playground.check({
      files: current.files,
      unsafeDirs: split(current.unsafeDirs),
      allowedImports: split(current.allowedImports),
      compilerFlags: current.flags,
      enabledRules: playground.rules.map((rule) => rule.name).filter((name) => !current.disabled.includes(name)),
    });
    failure = undefined;
  } catch (cause) {
    // A check that crashed has proven nothing: the page says so instead of showing "conforming".
    outcome = undefined;
    failure = `strict-ts failed: ${message(cause)}`;
  }
  renderAll(false);
}

function scheduleCheck(delay = 300): void {
  clearTimeout(checkTimer);
  checkTimer = setTimeout(runCheck, delay);
}

// ── Rendering: header and footer ─────────────────────
function renderHeader(): void {
  const select = $('preset');
  if (select instanceof HTMLSelectElement) {
    if (select.options.length === 0) {
      select.innerHTML = DATA.scenarios.map((s) => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join('');
    }
    select.value = state.scenario;
  }
  $('intro').textContent = scenarioById(state.scenario)?.intro ?? '';

  const verdict = $('verdict');
  const text = $('verdict-text');
  const count = diagnostics().length;
  if (failure !== undefined) {
    verdict.className = 'verdict ko';
    text.textContent = 'Not checked';
  } else if (outcome === undefined) {
    verdict.className = 'verdict loading';
    text.textContent = 'Loading the compiler…';
  } else if (count === 0) {
    verdict.className = 'verdict ok';
    text.textContent = 'Conforming: 0 errors';
  } else {
    verdict.className = 'verdict ko';
    text.textContent = plural(count, 'error');
  }
}

function renderFoot(): void {
  const lines = Object.values(workspace().files).reduce((sum, text) => sum + text.trimEnd().split('\n').length, 0);
  const parts = [`TypeScript ${esc(playground?.version ?? DATA.tsVersion)}`, `Project: ${plural(lines, 'line')}`];
  if (outcome !== undefined) {
    parts.push(`${plural(outcome.filesChecked, 'file')} checked`, `${Math.round(outcome.durationMs)} ms`);
  }
  if (failure !== undefined) parts.push(`<span class="err">${esc(failure)}</span>`);
  parts.push('Tab inserts two spaces');
  $('foot').innerHTML = parts.map((part) => `<span>${part}</span>`).join('');
}

// ── Rendering: explorer ──────────────────────────────
function fileRow(path: string, deletable: boolean): string {
  const count = diagnosticsOf(path).length;
  const slash = path.lastIndexOf('/');
  const dir = slash >= 0 ? path.slice(0, slash + 1) : '';
  const name = path.slice(slash + 1);
  const badge = isUnsafePath(path) ? '<span class="badge-unsafe">unsafe</span>' : '';
  const errors = count > 0 ? `<span class="count">${count}</span>` : '';
  const remove = deletable
    ? `<button class="del" type="button" data-del="${esc(path)}" aria-label="Delete ${esc(path)}">✕</button>`
    : '';
  return `<li class="file${path === workspace().active ? ' active' : ''}">
    <button class="open" type="button" data-open="${esc(path)}" title="${esc(path)}"><span class="name"><span class="dir">${esc(dir)}</span>${esc(name)}</span>${badge}${errors}</button>
    ${remove}
  </li>`;
}

function renderFiles(): void {
  const project = Object.keys(workspace().files).toSorted();
  const std = Object.keys(DATA.env.std)
    .toSorted()
    .map((name) => `${STD_PREFIX}${name}`);
  $('files').innerHTML =
    `<li class="group">Project</li>${project.map((path) => fileRow(path, true)).join('')}` +
    `<li class="group">${esc(STD_NAME)} · trusted library</li>${std.map((path) => fileRow(path, false)).join('')}`;
}

// ── Rendering: editor ────────────────────────────────
function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

/** The offsets a diagnostic covers in its file's text. */
function range(d: Diagnostic, starts: readonly number[], length: number): readonly [number, number] {
  const offset = (line: number, column: number): number => Math.min((starts[line - 1] ?? 0) + column - 1, length);
  const start = offset(d.start.line, d.start.column);
  return [start, Math.max(offset(d.end.line, d.end.column), Math.min(start + 1, length))];
}

function renderHighlight(): void {
  const path = workspace().active;
  const text = fileText(path);
  const starts = lineStarts(text);
  const tokens = playground?.classify(text) ?? [];
  const here = diagnosticsOf(path).filter((d) => d.start.line > 0);
  const ranges = here.map((d) => range(d, starts, text.length));

  const points = new Set([0, text.length]);
  for (const [start, end] of [...tokens, ...ranges]) {
    points.add(start);
    points.add(end);
  }
  const sorted = [...points].toSorted((a, b) => a - b);

  let html = '';
  let index = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i] ?? 0;
    const to = sorted[i + 1] ?? from;
    if (from === to) continue;
    while (index < tokens.length && (tokens[index]?.[1] ?? 0) <= from) index++;
    const token = tokens[index];
    const tokenClass = token !== undefined && token[0] <= from ? `k-${token[2]}` : '';
    const squiggle = ranges.some(([start, end]) => start <= from && to <= end) ? 'sq' : '';
    const classes = [tokenClass, squiggle].filter((name) => name !== '').join(' ');
    const chunk = esc(text.slice(from, to));
    html += classes === '' ? chunk : `<span class="${classes}">${chunk}</span>`;
  }
  $('hl').innerHTML = `${html}\n `;

  const errorLines = new Set(here.map((d) => d.start.line));
  $('gutter').innerHTML = starts
    .map((_, i) => `<div${errorLines.has(i + 1) ? ' class="err"' : ''}>${i + 1}</div>`)
    .join('');
}

const source = (): HTMLTextAreaElement | undefined => {
  const element = $('src');
  return element instanceof HTMLTextAreaElement ? element : undefined;
};

function renderCaretBar(): void {
  const editor = source();
  const bar = $('caret-bar');
  if (editor === undefined) return;
  if (outcome === undefined) {
    bar.innerHTML =
      '<span class="muted">The code can be edited right away; checking starts once the compiler is loaded.</span>';
    return;
  }
  const line = editor.value.slice(0, editor.selectionStart).split('\n').length;
  const here = diagnosticsOf(workspace().active).filter((d) => d.start.line === line);
  const first = here[0];
  if (first === undefined) {
    bar.innerHTML = `<span class="muted">Line ${line}: nothing to report. Put the caret on an underlined line to read its diagnostic.</span>`;
    return;
  }
  const help = first.help === undefined ? '' : `<span class="muted">${esc(first.help)}</span>`;
  const more = here.length > 1 ? `<span class="muted">(+${here.length - 1} on this line)</span>` : '';
  bar.innerHTML = `<code class="mono" style="color:var(--err);font-weight:600">error[${esc(first.rule)}]</code><span>${esc(first.message)}</span>${help}${more}`;
}

function renderEditor(): void {
  const path = workspace().active;
  const editor = source();
  const text = fileText(path);
  if (editor !== undefined) {
    if (editor.value !== text) editor.value = text;
    editor.readOnly = isStd(path);
  }
  $('ed-path').textContent = path === '' ? 'No file' : path;
  $('ed-tag').innerHTML = isStd(path)
    ? 'read-only · not checked by the rules'
    : isUnsafePath(path)
      ? '<span class="badge-unsafe">unsafe</span>'
      : '';
  renderHighlight();
  renderCaretBar();
}

// ── Rendering: panel ─────────────────────────────────
function renderTabs(): void {
  for (const tab of document.querySelectorAll<HTMLElement>('.tab')) {
    tab.setAttribute('aria-selected', String(tab.dataset['tab'] === state.tab));
  }
  $('n-problems').textContent = outcome === undefined ? '' : String(diagnostics().length);
}

/** The line of a diagnostic with carets under its span, as rustc prints it. */
function snippet(d: Diagnostic): string {
  if (d.start.line === 0) return '';
  const lineText = fileText(d.file).split(/\r?\n/)[d.start.line - 1];
  if (lineText === undefined) return '';
  const number = String(d.start.line);
  const pad = ' '.repeat(number.length);
  const until = d.end.line === d.start.line ? d.end.column : lineText.length + 1;
  const width = Math.max(1, Math.min(until, lineText.length + 1) - d.start.column);
  return `<pre class="d-snip"><span class="ln">${pad} |</span>\n<span class="ln">${number} |</span> ${esc(lineText)}\n<span class="ln">${pad} |</span> ${' '.repeat(d.start.column - 1)}<span class="mark">${'^'.repeat(width)}</span></pre>`;
}

function renderProblems(): string {
  if (failure !== undefined) return `<div class="empty">${esc(failure)}</div>`;
  if (outcome === undefined) return `<div class="empty">Loading TypeScript ${esc(DATA.tsVersion)}…</div>`;
  const all = diagnostics();
  if (all.length === 0) {
    return '<div class="empty"><strong>Conforming</strong>No any, cast, throw or null outside unsafe/. Every Result is handled.</div>';
  }
  const counts = countsByRule();
  if (state.filter !== undefined && !counts.has(state.filter)) state.filter = undefined;
  const chips = [...counts]
    .toSorted((a, b) => b[1] - a[1])
    .map(
      ([rule, count]) =>
        `<button class="chip" type="button" data-filter="${esc(rule)}" aria-pressed="${state.filter === rule}">${esc(rule)} <b>${count}</b></button>`,
    )
    .join('');
  const items = all
    .map((d, index) => {
      if (state.filter !== undefined && d.rule !== state.filter) return '';
      const place = d.start.line > 0 ? `:${d.start.line}:${d.start.column}` : '';
      const help = d.help === undefined ? '' : `<div class="d-help"><b>= help:</b> ${esc(d.help)}</div>`;
      return `<li><button class="diag" type="button" data-diag="${index}">
        <div class="d-head"><span class="sev">error</span><span class="rule-id">[${esc(d.rule)}]</span>: <span class="msg">${esc(d.message)}</span></div>
        <div class="d-loc"><span class="arrow">--&gt;</span> ${esc(d.file === '' ? '(global)' : d.file)}${place}</div>
        ${snippet(d)}
        ${help}
      </button></li>`;
    })
    .join('');
  return `<div class="chips">${chips}</div><ul class="diags">${items}</ul>`;
}

function renderRules(): string {
  const current = workspace();
  const counts = countsByRule();
  const rows = (playground?.rules ?? []).map((rule) => {
    const on = !current.disabled.includes(rule.name);
    const count = counts.get(rule.name) ?? 0;
    return `<li class="rule">
      <label class="switch"><input type="checkbox" id="rule-${esc(rule.name)}" data-rule="${esc(rule.name)}" ${on ? 'checked' : ''} aria-label="Enable ${esc(rule.name)}"><span></span></label>
      <span class="rid">${esc(rule.name)}</span>
      <span class="meta"><span class="scope ${rule.scope === 'unsafe' ? 'unsafe' : ''}">${esc(rule.scope)}</span><span class="hits ${count > 0 ? '' : 'zero'}">${on ? count : 'off'}</span></span>
      <span class="desc">${esc(rule.description)}</span>
    </li>`;
  });
  return `<ul class="rules">${rows.join('')}</ul>`;
}

function renderConfig(): string {
  const current = workspace();
  const flags = (playground?.requiredCompilerOptions ?? Object.keys(current.flags))
    .map(
      (option) =>
        `<label class="flag"><input type="checkbox" id="flag-${esc(option)}" data-flag="${esc(option)}" ${current.flags[option] === true ? 'checked' : ''}>${esc(option)}</label>`,
    )
    .join('');
  return `<div class="config">
    <div>
      <h3><label for="cfg-unsafe">Unsafe directories</label></h3>
      <p>The only place where any, casts, throw, null and external imports are allowed. Separated by commas.</p>
      <input class="text-input" id="cfg-unsafe" value="${esc(current.unsafeDirs)}">
    </div>
    <div>
      <h3><label for="cfg-imports">Imports allowed outside unsafe</label></h3>
      <p>The non-relative imports safe code may use.</p>
      <input class="text-input" id="cfg-imports" value="${esc(current.allowedImports)}">
    </div>
    <div>
      <h3>Compiler options</h3>
      <p>Untick one to see the rule strict-compiler-options fire.</p>
      <div class="flags">${flags}</div>
    </div>
    <div>
      <h3>Simulated environment</h3>
      <p>Available without an import: <code>console</code>, <code>process.env</code>, <code>fetch</code>. Simulated modules: <code>node:fs</code>, <code>node:crypto</code>, <code>zod</code>.</p>
      <p><code>${esc(STD_NAME)}</code> gives <code>Result</code> (methods, <code>Result.gen</code>, <code>attempt</code>), <code>Option</code>, the schemas <code>s</code> and <code>panic</code>. It is trusted code: checked by TypeScript, not by the rules, like Rust's std, which holds unsafe code.</p>
    </div>
  </div>`;
}

function renderPanel(force: boolean): void {
  renderTabs();
  const body = $('panel');
  // The configuration does not depend on the result: it is not redrawn while the user types in it.
  if (state.tab === 'config' && body.dataset['view'] === `config:${state.scenario}` && !force) return;
  const focused = document.activeElement !== null && body.contains(document.activeElement) ? document.activeElement.id : '';
  const scroll = body.scrollTop;
  body.innerHTML = state.tab === 'rules' ? renderRules() : state.tab === 'config' ? renderConfig() : renderProblems();
  body.dataset['view'] = `${state.tab}:${state.scenario}`;
  body.scrollTop = scroll;
  if (focused !== '') document.getElementById(focused)?.focus({ preventScroll: true });
}

function renderAll(force: boolean): void {
  renderHeader();
  renderFiles();
  renderEditor();
  renderPanel(force);
  renderFoot();
}

// ── Interactions ─────────────────────────────────────
function openFile(path: string): void {
  workspace().active = path;
  save();
  renderFiles();
  renderEditor();
  $('ed-scroll').scrollTop = 0;
}

function reveal(d: Diagnostic | undefined): void {
  if (d === undefined || d.file === '' || (!isStd(d.file) && !(d.file in workspace().files))) return;
  if (workspace().active !== d.file) openFile(d.file);
  const editor = source();
  if (editor === undefined) return;
  const [start, end] = range(d, lineStarts(editor.value), editor.value.length);
  editor.focus({ preventScroll: true });
  editor.setSelectionRange(start, end);
  const lineHeight = Number.parseFloat(getComputedStyle(editor).lineHeight);
  $('ed-scroll').scrollTop = Math.max(0, (d.start.line - 4) * (Number.isNaN(lineHeight) ? 21 : lineHeight));
  renderCaretBar();
}

const closest = (event: Event, selector: string): HTMLElement | undefined => {
  const found = event.target instanceof Element ? event.target.closest(selector) : null;
  return found instanceof HTMLElement ? found : undefined;
};

$('preset').addEventListener('change', (event) => {
  if (!(event.target instanceof HTMLSelectElement)) return;
  state.scenario = event.target.value;
  state.filter = undefined;
  save();
  renderAll(true);
  runCheck();
});

let resetArmed = 0;
$('reset').addEventListener('click', () => {
  const button = $('reset');
  const disarm = (): void => {
    clearTimeout(resetArmed);
    resetArmed = 0;
    button.textContent = 'Reset';
    button.classList.remove('danger');
  };
  if (resetArmed === 0) {
    button.textContent = 'Confirm: discard my changes';
    button.classList.add('danger');
    resetArmed = setTimeout(disarm, 4000);
    return;
  }
  disarm();
  state.workspaces[state.scenario] = freshWorkspace(scenarioById(state.scenario));
  save();
  renderAll(true);
  runCheck();
});

$('files').addEventListener('click', (event) => {
  const open = closest(event, '[data-open]')?.dataset['open'];
  if (open !== undefined) {
    openFile(open);
    return;
  }
  const removed = closest(event, '[data-del]')?.dataset['del'];
  if (removed === undefined) return;
  const current = workspace();
  current.files = Object.fromEntries(Object.entries(current.files).filter(([path]) => path !== removed));
  if (current.active === removed) current.active = Object.keys(current.files).toSorted()[0] ?? `${STD_PREFIX}index.ts`;
  save();
  renderAll(false);
  scheduleCheck();
});

$('add-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('new-file');
  const note = $('add-msg');
  if (!(input instanceof HTMLInputElement)) return;
  const typed = input.value.trim().replace(/^\.?\/+/, '');
  const name = typed === '' || typed.endsWith('.ts') ? typed : `${typed}.ts`;
  const error =
    name === ''
      ? 'Give a name, for instance src/unsafe/db.ts.'
      : !/^[\w./-]+\.ts$/.test(name) || name.includes('..')
        ? 'Use letters, digits, - _ / and the extension .ts.'
        : name in workspace().files
          ? `${name} already exists.`
          : '';
  note.hidden = error === '';
  note.textContent = error;
  if (error !== '') return;
  workspace().files[name] = isUnsafePath(name)
    ? `// ${name}: unsafe zone. Export only functions that return Result or Option.\nimport { attempt, type Result } from "${STD_NAME}";\n\nexport function example(): Result<string, string> {\n  return attempt(() => "ok", (cause) => String(cause));\n}\n`
    : `// ${name}\nimport { ok, type Result } from "${STD_NAME}";\n\nexport function example(): Result<number, never> {\n  return ok(42);\n}\n`;
  input.value = '';
  openFile(name);
  scheduleCheck();
});

const editor = source();
if (editor !== undefined) {
  editor.addEventListener('input', () => {
    const path = workspace().active;
    if (isStd(path)) return;
    workspace().files[path] = editor.value;
    save();
    renderHighlight();
    scheduleCheck();
  });
  editor.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' || event.shiftKey || event.metaKey || event.ctrlKey || editor.readOnly) return;
    event.preventDefault();
    editor.setRangeText('  ', editor.selectionStart, editor.selectionEnd, 'end');
    editor.dispatchEvent(new Event('input'));
  });
  for (const name of ['keyup', 'click', 'select']) editor.addEventListener(name, renderCaretBar);
}

document.querySelector('.tabs')?.addEventListener('click', (event) => {
  const tab = closest(event, '[data-tab]')?.dataset['tab'];
  if (tab !== 'problems' && tab !== 'rules' && tab !== 'config') return;
  state.tab = tab;
  save();
  renderPanel(true);
});

$('panel').addEventListener('click', (event) => {
  const filter = closest(event, '[data-filter]')?.dataset['filter'];
  if (filter !== undefined) {
    state.filter = state.filter === filter ? undefined : filter;
    renderPanel(false);
    return;
  }
  const index = closest(event, '[data-diag]')?.dataset['diag'];
  if (index !== undefined) reveal(diagnostics()[Number(index)]);
});

$('panel').addEventListener('change', (event) => {
  const current = workspace();
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const rule = target.dataset['rule'];
  const flag = target.dataset['flag'];
  if (rule !== undefined) {
    current.disabled = target.checked ? current.disabled.filter((name) => name !== rule) : [...current.disabled, rule];
  } else if (flag !== undefined) {
    current.flags[flag] = target.checked;
  } else {
    return;
  }
  save();
  runCheck();
});

$('panel').addEventListener('input', (event) => {
  const current = workspace();
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.id === 'cfg-unsafe') current.unsafeDirs = target.value;
  else if (target.id === 'cfg-imports') current.allowedImports = target.value;
  else return;
  save();
  renderFiles();
  scheduleCheck(400);
});

// ── Start ────────────────────────────────────────────
renderAll(false);
if (COMPILER === undefined) {
  failure = 'The TypeScript compiler did not load: typescript.js must sit beside this page.';
  renderAll(true);
} else {
  try {
    playground = createPlayground(COMPILER, DATA.env);
    runCheck();
  } catch (cause) {
    failure = `strict-ts did not start: ${message(cause)}`;
    renderAll(true);
  }
}
