import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rules } from '@strict-ts/core';
import ts from '@typescript/typescript6';
import { beforeAll, describe, expect, test } from 'vitest';
import { collect } from '../scripts/data.mjs';
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

describe('the five scenarios, checked as the page checks them', () => {
  test('there are five, each with a label, an intro and files', () => {
    expect(data.scenarios.map((scenario: { id: string }) => scenario.id)).toEqual([
      'challenge',
      'challenge-solution',
      'challenge-solution-detailed',
      'clean',
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

  test('the challenge is refused nine times, the scenario of violations by every rule', () => {
    expect(playground.check(request('challenge')).diagnostics).toHaveLength(9);
    const triggered = new Set(playground.check(request('violations')).diagnostics.map((d) => d.rule));
    expect([...triggered].toSorted()).toEqual(rules.map((rule) => rule.name).toSorted());
  });

  test.each(['challenge-solution', 'challenge-solution-detailed', 'clean'])('%s is conforming', (id) => {
    expect(playground.check(request(id)).diagnostics).toEqual([]);
  });

  test('the challenge lines are counted as the README says: 58 against 39', () => {
    const label = (id: string) => data.scenarios.find((scenario: { id: string }) => scenario.id === id).label;
    expect(label('challenge')).toBe('Challenge: an invoice to fix · 58 lines');
    expect(label('challenge-solution')).toBe('Concise solution · 39 lines');
  });
});

describe('the settings of the page reach the rules', () => {
  test('a disabled rule reports nothing', () => {
    const enabledRules = rules.map((rule) => rule.name).filter((name) => name !== 'no-null');
    const found = playground.check(request('challenge', { enabledRules })).diagnostics;
    expect(found).toHaveLength(7);
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
    expect(src.toSorted()).toEqual(['app.ts', 'engine.ts']);
    expect(imports('engine.ts')).toEqual(['@strict-ts/core', '@strict-ts/core/typescript6', '@typescript/typescript6']);
    expect(imports('app.ts')).toEqual(['@strict-ts/core', '@typescript/typescript6', './engine.js']);
    expect(playground.rules).toBe(rules);
    for (const name of src) {
      const text = readFileSync(`${root}src/${name}`, 'utf8');
      expect(text).toContain('import type ts from');
      expect(text).not.toMatch(/\bvisit\s*[(:]|\bguarantee\s*:/);
    }
  });
});

describe('the built page', () => {
  beforeAll(() => {
    execFileSync(process.execPath, [`${root}scripts/build.mjs`], { cwd: root });
  }, 60_000);

  test('is one page and the compiler beside it', () => {
    expect(readdirSync(`${root}dist`).toSorted()).toEqual(['index.html', 'typescript.js']);
    expect(existsSync(`${root}dist/typescript.js`)).toBe(true);
  });

  test('loads nothing but its own files', () => {
    const html = readFileSync(`${root}dist/index.html`, 'utf8');
    const loaded = [...html.matchAll(/<(?:script|link|img|iframe)\b[^>]*?\b(?:src|href)="([^"]*)"/g)].map((match) => match[1]);
    expect(loaded).toEqual(['typescript.js']);
    const style = /<style>(.*?)<\/style>/s.exec(html)?.[1] ?? '';
    expect(style.length).toBeGreaterThan(1000);
    expect(style).not.toMatch(/@import|url\(/);
  });

  test('embeds the scenarios and the engine', () => {
    const html = readFileSync(`${root}dist/index.html`, 'utf8');
    expect(html).not.toContain('<!--DATA-->');
    expect(html).not.toContain('<!--APP-->');
    const embedded = /<script id="st-data" type="application\/json">(.*?)<\/script>/s.exec(html)?.[1] ?? '';
    expect(JSON.parse(embedded).scenarios).toHaveLength(5);
    expect(html).toContain('no-external-import');
  });
});
