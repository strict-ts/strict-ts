import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rules } from '@strict-ts/core';
import ts from '@typescript/typescript6';
import { beforeAll, describe, expect, test } from 'vitest';
import { collect } from '../scripts/data.mjs';
import { DATA, HOST, parts } from '../scripts/page.mjs';
import { createPlayground, type Request } from '../src/engine.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = collect(ts);
const playground = createPlayground(ts, data.env);

const request = (id: string, change: Partial<Request> = {}): Request => {
  const scenario = data.scenarios.find((candidate: { id: string }) => candidate.id === id);
  return {
    files: scenario.files,
    unsafeDirs: ['src/unsafe'],
    allowedImports: ['@strict-ts/std'],
    compilerFlags: scenario.flags,
    enabledRules: rules.map((rule) => rule.name),
    ...change,
  };
};

describe('the scenarios, checked as the page checks them', () => {
  test('there are eleven, each with a label, an intro and files', () => {
    expect(data.scenarios.map((scenario: { id: string }) => scenario.id)).toEqual([
      'challenge',
      'challenge-solution',
      'challenge-solution-detailed',
      'clean',
      'report',
      'report-solution',
      'cart',
      'cart-solution',
      'transfer',
      'transfer-solution',
      'violations',
    ]);
    for (const scenario of data.scenarios) {
      expect(scenario.label).toMatch(/ · \d+ lines$/);
      expect(scenario.intro.length).toBeGreaterThan(20);
      expect(Object.keys(scenario.files).every((name) => name.startsWith('src/'))).toBe(true);
    }
  });

  test.each(['challenge', 'violations'])('%s shows diagnostics with a rule, a span and a help', (id) => {
    const { diagnostics, filesChecked } = playground.check(request(id));
    expect(filesChecked).toBeGreaterThan(0);
    expect(diagnostics.length).toBeGreaterThan(0);
    for (const diagnostic of diagnostics) {
      expect(rules.map((rule) => rule.name)).toContain(diagnostic.rule);
      expect(diagnostic.start.line).toBeGreaterThan(0);
      expect(diagnostic.end.column).toBeGreaterThan(0);
      expect(diagnostic.help?.length).toBeGreaterThan(10);
    }
  });

  test('the challenge is refused twenty-two times, the scenario of violations by every rule', () => {
    expect(playground.check(request('challenge')).diagnostics).toHaveLength(22);
    const triggered = new Set(playground.check(request('violations')).diagnostics.map((d) => d.rule));
    // pure-domain only runs in directories a project declares pure, and the page declares none; unread-sources is
    // about files the page does not have.
    const expected = rules.map((rule) => rule.name).filter((name) => name !== 'pure-domain' && name !== 'unread-sources');
    expect([...triggered].toSorted()).toEqual(expected.toSorted());
  });

  test('each example is refused by the rules it is about', () => {
    const refusedBy = (id: string) => new Set(playground.check(request(id)).diagnostics.map((d: { rule: string }) => d.rule));
    expect([...refusedBy('report')]).toEqual(expect.arrayContaining(['no-throwing-call', 'no-throwing-operator', 'no-any']));
    expect([...refusedBy('cart')]).toEqual(expect.arrayContaining(['no-param-mutation', 'readonly-types']));
    expect([...refusedBy('transfer')]).toEqual(expect.arrayContaining(['no-throw', 'readonly-types']));
  });

  test.each(['challenge-solution', 'challenge-solution-detailed', 'clean', 'report-solution', 'cart-solution', 'transfer-solution'])('%s is conforming', (id) => {
    expect(playground.check(request(id)).diagnostics).toEqual([]);
  });

  test('the challenge lines are counted as the documentation says: 58 against 39', () => {
    const label = (id: string) => data.scenarios.find((scenario: { id: string }) => scenario.id === id).label;
    expect(label('challenge')).toBe('Challenge: an invoice to fix · 58 lines');
    expect(label('challenge-solution')).toBe('Concise solution · 39 lines');
  });
});

describe('the settings of the page reach the rules', () => {
  test('a disabled rule reports nothing', () => {
    const enabledRules = rules.map((rule) => rule.name).filter((name) => name !== 'no-null');
    const found = playground.check(request('challenge', { enabledRules })).diagnostics;
    expect(found).toHaveLength(20);
    expect(found.some((d) => d.rule === 'no-null')).toBe(false);
  });

  test('an unticked compiler option is refused', () => {
    const compilerFlags = { ...request('clean').compilerFlags, strict: false };
    const found = playground.check(request('clean', { compilerFlags })).diagnostics;
    expect(found.map((d) => d.rule)).toContain('strict-compiler-options');
  });

  test('an edit is checked again', () => {
    const files = { ...request('clean').files };
    files['src/domain/user.ts'] += '\nexport const nothing = null;\n';
    expect(playground.check(request('clean', { files })).diagnostics.map((d) => `${d.file} ${d.rule}`)).toEqual([
      'src/domain/user.ts no-null',
    ]);
    expect(playground.check(request('clean')).diagnostics).toEqual([]);
  });
});

test('classify gives the tokens the editor colours', () => {
  const text = 'const greet = (name: string) => `Hi ${name}!`; // done';
  const classes = playground.classify(text).map(([start, end, tokenClass]) => `${tokenClass}:${text.slice(start, end)}`);
  expect(classes).toEqual(['kw:const', 'kw:string', 'punc:=>', 'str:`Hi ${', 'str:}!`', 'com:// done']);
});

describe('the sources', () => {
  const src = readdirSync(`${root}src`).filter((name) => name.endsWith('.ts'));
  const imports = (name: string): readonly string[] =>
    [...readFileSync(`${root}src/${name}`, 'utf8').matchAll(/^import\b[^;]*?\bfrom\s+['"]([^'"]+)['"]/gm)].flatMap(
      (match) => match[1] ?? [],
    );

  test('hold no rule: the rules come from an import of @strict-ts/core', () => {
    expect(src.toSorted()).toEqual(['app.ts', 'data.ts', 'engine.ts']);
    expect(imports('engine.ts')).toEqual(['@strict-ts/core', '@strict-ts/core/typescript6', '@strict-ts/std', '@typescript/typescript6']);
    expect(imports('app.ts')).toEqual(['@strict-ts/core', '@strict-ts/std', './data.js', './engine.js', './unsafe/page.js']);
    expect(playground.rules).toBe(rules);
    for (const name of src) {
      const text = readFileSync(`${root}src/${name}`, 'utf8');
      expect(text).not.toMatch(/\bvisit\s*[(:]|\bguarantee\s*:/);
    }
  });
});

describe('what the website is handed', () => {
  let made: { fragment: string; data: string; script: string; compiler: string; scenarios: number };
  beforeAll(async () => {
    made = await parts();
  }, 60_000);

  test('is a style and the markup the script writes into, and nothing that is loaded', () => {
    expect(made.fragment.startsWith('<style>')).toBe(true);
    const style = /<style>(.*?)<\/style>/s.exec(made.fragment)?.[1] ?? '';
    expect(style.length).toBeGreaterThan(1000);
    expect(style).not.toMatch(/@import|url\(/);
    // It lives in a shadow tree: its variables are the host's, and nothing is said of the page around it.
    expect(style).toContain(':host {');
    expect(style).not.toMatch(/:root|(?:^|[\s,}])(?:html|body)\s*[{,]/m);
    expect(made.fragment).not.toMatch(/<(?:script|link|img|iframe)\b/);
    expect(made.fragment).not.toContain('<!--');
    for (const id of ['preset', 'reset', 'verdict', 'intro', 'files', 'src', 'hl', 'gutter', 'panel', 'foot']) expect(made.fragment, id).toContain(` id="${id}"`);
  });

  test('holds the scenarios, the script that reads them, and where the compiler is', () => {
    expect(JSON.parse(made.data).scenarios).toHaveLength(11);
    expect(made.scenarios).toBe(11);
    expect(made.data).not.toContain('<');
    expect(made.script).toContain(`document.getElementById("${DATA}")`);
    expect(made.script).toContain('no-external-import');
    // The script looks for the page in the shadow tree of the element the site names after `HOST`.
    expect(readFileSync(`${root}src/app.ts`, 'utf8')).toContain(`document.getElementById('${HOST}')?.shadowRoot`);
    expect(existsSync(made.compiler)).toBe(true);
  });
});
