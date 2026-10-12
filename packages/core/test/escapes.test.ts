// The known ways for safe code to throw, to reject, or to lose an error, with no `throw` written and nothing the
// earlier rules refuse: each file of fixtures/escapes compiles under the strict options, and fails when it is run.
// This test records which of them the rules refuse today. One that is accepted is a hole in guarantee 3.
import { describe, expect, test } from 'vitest';
import { checkFiles, fixture } from './project.js';

const page = { compilerOptions: { lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'] }, config: { unsafeDirs: ['src/unsafe'], allowedImports: ['@strict-ts/std'] } };
const files = fixture('escapes');
const attacks = Object.keys(files).filter((name) => /^e\d\d-/.test(name));
// Beside the attack: the unsafe file four of them import, and the two files that import each other.
const beside = Object.fromEntries(Object.entries(files).flatMap(([name, text]) => (/^(unsafe|cycle)\//.test(name) ? [[`src/${name}`, text]] : [])));
/** What refuses the attack, in its own file or in the two files of the cycle. */
const refusedBy = (name: string): readonly string[] =>
  [...new Set(checkFiles({ ...beside, 'src/a.ts': files[name] ?? '' }, page).flatMap((d) => (d.file === 'src/a.ts' || d.file.startsWith('src/cycle/') ? [d.rule] : [])))].toSorted();

describe('the attacks on errors in the types', () => {
  test('each one compiles', () => {
    for (const name of attacks) expect(refusedBy(name).filter((rule) => rule.startsWith('TS')), name).toEqual([]);
  });

  test('the ledger and the operators refuse those that call or use what throws', () => {
    const byLedger = ['e03-promise-reject', 'e08-proxy', 'e09-define-property', 'e11-reduce-of-nothing', 'e12-number-to-bigint', 'e13-repeat', 'e20-normalize', 'e22-structured-clone', 'e27-with-resolvers'];
    for (const name of byLedger) expect(refusedBy(`${name}.ts`), name).toContain('no-throwing-call');
    for (const name of ['e04-setter-of-the-library', 'e05-getter-of-the-library', 'e07-object-to-text']) expect(refusedBy(`${name}.ts`), name).toContain('no-throwing-operator');
    // These three need a cast or an `any` to be written at all.
    for (const name of ['e06-template-with-a-symbol', 'e15-iterator-of-the-author', 'e18-class-called']) expect(refusedBy(`${name}.ts`), name).toContain('no-cast');
    expect(refusedBy('e10-eval.ts')).toContain('no-any');
  });

  test('a promise is not made to fail', () => {
    for (const name of ['e02-rejected-by-the-callback', 'e16-dropped-rejection', 'e17-await-of-a-thenable', 'e21-async-function']) expect(refusedBy(`${name}.ts`), name).toEqual(['no-reject']);
  });

  test('from safe code, only what says its failure is taken from an unsafe directory', () => {
    for (const name of ['e23-unsafe-object', 'e24-unsafe-class', 'e25-unsafe-returned-function', 'e26-unsafe-getter']) expect(refusedBy(`${name}.ts`), name).toEqual(['no-throwing-call']);
  });

  test('three are accepted: two holes of guarantee 3, and a stack that overflows', () => {
    const accepted = attacks.filter((name) => refusedBy(name).length === 0).toSorted();
    expect(accepted).toEqual([
      // Read before the line that gives it a value, in one file and across two.
      'e01-read-before-declaration.ts',
      // A function that calls itself without end: the stack overflows. Not closed, and said as a limit.
      'e14-recursion.ts',
      'e28-import-cycle.ts',
    ]);
  });
});
