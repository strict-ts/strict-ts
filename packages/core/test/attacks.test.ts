// The known ways to make a value differ at run time from its static type, with no `any`, cast, `!` or `declare`:
// each file of fixtures/attacks compiles under the strict options, and prints BROKEN when it is run. This test
// records which of them the rules refuse today. An attack that is accepted is a hole in guarantee 2: closing one
// changes a line here, and none may be closed by accident or reopened unseen.
import { describe, expect, test } from 'vitest';
import { checkFiles, fixture } from './project.js';

const page = { compilerOptions: { lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'] } };
const attacks = fixture('attacks');
// Of the file itself: with the DOM, the environment of the tests declares `console` a second time.
const refusedBy = (name: string): readonly string[] =>
  [...new Set(checkFiles({ 'src/a.ts': attacks[name] ?? '' }, page).flatMap((d) => (d.file === 'src/a.ts' ? [d.rule] : [])))].toSorted();

describe('the attacks on safe typing', () => {
  test('each one compiles: what refuses it, if anything, is a rule and not the compiler', () => {
    for (const name of Object.keys(attacks)) expect(refusedBy(name).filter((rule) => rule.startsWith('TS')), name).toEqual([]);
  });

  test('seven are refused', () => {
    // Refused for another reason than the hole: `new Array(n)` may throw. The holes it makes are not what is seen.
    expect(refusedBy('a01-sparse-array.ts')).toEqual(['no-throwing-call']);
    expect(refusedBy('a12-is-array.ts')).toEqual(['no-any']);
    // An overload is a promise nobody checks; the second one was a cast with no `as`.
    expect(refusedBy('a31-overload-that-lies.ts')).toEqual(['no-overload']);
    expect(refusedBy('a32-overload-as-a-cast.ts')).toEqual(['no-overload']);
    // Written as a property with a function type, the member of the interface is compared soundly.
    expect(refusedBy('a04-method-bivariance.ts')).toEqual(['no-method-signature']);
    expect(refusedBy('a07-number-to-enum.ts')).toEqual(['no-numeric-enum']);
    expect(refusedBy('a06-closure-before-assignment.ts')).toEqual(['no-unset-capture']);
  });

  test('sixteen are accepted: the holes of guarantee 2, to close one by one', () => {
    const accepted = Object.keys(attacks)
      .filter((name) => refusedBy(name).length === 0)
      .toSorted();
    // By family, with the task that is to close each: the Plane page « Review · guarantee 2, safe typing ».
    expect(accepted).toEqual([
      'a02-object-values.ts',
      'a03-in-narrowing.ts',
      'a05-constructor-order.ts',
      'a08-narrowing-outlives-a-call.ts',
      'a09-array-covariance.ts',
      'a10-tuple-pop.ts',
      'a16-spread-overwrite.ts',
      'a20-method-without-its-object.ts',
      'a21-read-before-declaration.ts',
      'a40-array-length.ts',
      'b01-spread-optional.ts',
      'b09-keyed-write.ts',
      'b14-narrowed-let.ts',
      'b15-destructured-iterable.ts',
      'b21-getter-narrowing.ts',
      'b31-instanceof.ts',
    ]);
  });
});
