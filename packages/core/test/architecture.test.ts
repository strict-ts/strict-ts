// The two walls of core: no rule knows a compiler, and nothing in the package needs Node.
import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const src = new URL('../src/', import.meta.url);
const sources = readdirSync(src, { recursive: true, encoding: 'utf8' })
  .filter((name) => name.endsWith('.ts'))
  .map((name) => ({ name: name.replaceAll('\\', '/'), text: readFileSync(new URL(name, src), 'utf8') }));

const imported = /^(?:import|export)\b[^;]*?\bfrom\s+['"]([^'"]+)['"]/gm;
const importsOf = (text: string): readonly string[] => [...text.matchAll(imported)].flatMap((match) => match[1] ?? []);

test('the sources are found', () => {
  expect(sources.length).toBeGreaterThan(15);
});

test('only the TypeScript 6 provider imports a compiler, and its types only', () => {
  const compilers = sources.flatMap(({ name, text }) =>
    importsOf(text)
      .filter((specifier) => specifier === 'typescript' || specifier.startsWith('@typescript/'))
      .map((specifier) => `${name} ${specifier}`),
  );
  expect(compilers).toEqual(['typescript6/provider.ts @typescript/typescript6']);
  const provider = sources.find(({ name }) => name === 'typescript6/provider.ts');
  expect(provider?.text).toContain("import type ts from '@typescript/typescript6';");
});

test('nothing but the provider imports outside the package', () => {
  const outside = sources.flatMap(({ name, text }) =>
    importsOf(text)
      .filter((specifier) => !specifier.startsWith('.') && !specifier.startsWith('@typescript/'))
      .map((specifier) => `${name} ${specifier}`),
  );
  expect(outside).toEqual([]);
});

test('no source uses a Node global', () => {
  const comments = /\/\*[\s\S]*?\*\/|\/\/.*$/gm;
  const nodeGlobal = /\bprocess\.|\brequire\(|\b__dirname\b|\b__filename\b|\bBuffer\b/;
  const users = sources.filter(({ text }) => nodeGlobal.test(text.replace(comments, '')));
  expect(users.map(({ name }) => name)).toEqual([]);
});

test('the documentation lists every rule of the catalogue', async () => {
  const { rules } = await import('../src/index.js');
  const read = (name: string) => readFileSync(new URL(`../../../docs/${name}`, import.meta.url), 'utf8');
  const readme = read('rules.md');
  const documented = rules.map((rule) => rule.name).filter((name) => readme.includes(`| \`${name}\` |`));
  expect(documented).toEqual(rules.map((rule) => rule.name));
  expect(read('packages.md')).toContain(`${rules.length} rules`);
});
