// Gathers what the page embeds: the scenarios, the standard library's sources and the compiler's libraries.
// Everything is read from the monorepo as it is: the examples, core's fixtures, packages/std.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const read = (path) => readFileSync(join(repo, path), 'utf8');

/** The .ts files of a directory, keyed by the path the scenario shows them under. */
function project(directory, rename = (name) => name) {
  const names = readdirSync(join(repo, directory), { recursive: true, encoding: 'utf8' })
    .map((name) => name.replaceAll('\\', '/'))
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.d.ts'))
    .toSorted();
  return Object.fromEntries(names.map((name) => [rename(name), read(join(directory, name))]));
}

const allFlags = {
  strict: true,
  noUncheckedIndexedAccess: true,
  exactOptionalPropertyTypes: true,
  noImplicitReturns: true,
  noFallthroughCasesInSwitch: true,
  noImplicitOverride: true,
};
const lines = (files) => Object.values(files).reduce((sum, text) => sum + text.trimEnd().split('\n').length, 0);
const scenario = (id, title, intro, files, flags = allFlags) => ({
  id,
  label: `${title} · ${lines(files)} lines`,
  intro,
  flags,
  files,
});

export function scenarios() {
  const fixtures = 'packages/core/test/fixtures';
  return [
    scenario(
      'challenge',
      'Challenge: an invoice to fix',
      '"Classic" TypeScript that passes tsc --strict. Make it conform: 0 errors from strict-ts.',
      project('examples/invoice/classic', (name) => `src/${name}`),
    ),
    scenario(
      'challenge-solution',
      'Concise solution',
      'Schemas, Result with methods, a satisfies object: conforming, and shorter than the original.',
      project('examples/invoice/strict', (name) => `src/${name}`),
    ),
    scenario(
      'challenge-solution-detailed',
      'Detailed solution (v1 style)',
      'The same invoice validated by hand, with free functions: conforming, but twice as long.',
      project(`${fixtures}/detailed`),
    ),
    scenario(
      'clean',
      'Conforming project',
      'Result.gen stands in for the ? operator of Rust; fetch and JSON.parse stay in unsafe/. Try slipping a throw in.',
      project(`${fixtures}/clean`),
    ),
    scenario(
      'report',
      'What throws: a report',
      'JSON.parse, a pattern, a bigint division, toFixed, a template: five ways to throw that no type announces.',
      project('examples/report/classic', (name) => `src/${name}`),
    ),
    scenario(
      'report-solution',
      'What throws: conforming',
      'What may throw is called in unsafe/ and leaves as a Result; the division gives an Option.',
      project('examples/report/strict', (name) => `src/${name}`),
    ),
    scenario(
      'cart',
      'Mutability: a cart',
      'Functions that change what they are given. Nothing in a signature says so.',
      project('examples/cart/classic', (name) => `src/${name}`),
    ),
    scenario(
      'cart-solution',
      'Mutability: conforming',
      'Read-only types, copies, and Mut<…> where changing in place is wanted. Try a push on a parameter that does not ask for it.',
      project('examples/cart/strict', (name) => `src/${name}`),
    ),
    scenario(
      'transfer',
      'Ownership: a transfer',
      'A transaction left open on one path, held by two owners, used after it was ended.',
      project('examples/transfer/classic', (name) => `src/${name}`),
    ),
    scenario(
      'transfer-solution',
      'Ownership: conforming',
      'Once<Transaction> has one owner. Remove the rollback, or use tx after the commit, and see it refused.',
      project('examples/transfer/strict', (name) => `src/${name}`),
    ),
    scenario(
      'violations',
      'One violation per rule',
      'Every rule is triggered at least once, the missing compiler option included.',
      project(`${fixtures}/violations`),
      { ...allFlags, noImplicitOverride: false },
    ),
  ];
}

/** The declaration files `entry` needs, following its `/// <reference lib="…" />` lines. */
function libraries(directory, entry) {
  const found = {};
  const visit = (name) => {
    if (name in found) return;
    const text = readFileSync(join(directory, name), 'utf8');
    found[name] = text;
    for (const match of text.matchAll(/^\/\/\/\s*<reference\s+lib="([^"]+)"\s*\/>/gm)) visit(`lib.${match[1]}.d.ts`);
  };
  visit(entry);
  return found;
}

/** `ts` is the TypeScript 6 module; its own directory holds the library declarations and the browser build. */
export function collect(ts) {
  const lib = dirname(ts.getDefaultLibFilePath({}));
  return {
    compiler: join(lib, 'typescript.js'),
    data: {
      tsVersion: ts.version,
      scenarios: scenarios(),
      env: {
        libs: libraries(lib, 'lib.es2022.d.ts'),
        std: project('packages/std/src'),
        ambient: read('packages/core/test/fixtures/env.d.ts'),
      },
    },
  };
}
