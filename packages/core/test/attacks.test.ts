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

  test('twenty-two are refused', () => {
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
    expect(refusedBy('a05-constructor-order.ts')).toEqual(['no-early-this']);
    expect(refusedBy('a20-method-without-its-object.ts')).toEqual(['no-unbound-method']);
    // Mutable collections: seen under a wider type, resized, written through a key that is several names.
    expect(refusedBy('a09-array-covariance.ts')).toEqual(['mut-exact']);
    expect(refusedBy('a10-tuple-pop.ts')).toEqual(['no-resize']);
    expect(refusedBy('a40-array-length.ts')).toEqual(['no-resize']);
    expect(refusedBy('c01-index-write-hole.ts')).toEqual(['no-resize']);
    expect(refusedBy('b09-keyed-write.ts')).toEqual(['no-keyed-write']);
    // A value that holds more than its type names: read whole, narrowed by `in`, spread, taken for a class.
    expect(refusedBy('a02-object-values.ts')).toEqual(['no-open-read']);
    expect(refusedBy('a03-in-narrowing.ts')).toEqual(['no-in-narrowing']);
    expect(refusedBy('a16-spread-overwrite.ts')).toEqual(['no-loose-spread']);
    expect(refusedBy('b01-spread-optional.ts')).toEqual(['no-loose-spread']);
    expect(refusedBy('b31-instanceof.ts')).toEqual(['no-class-lookalike']);
    // What a test narrowed, changed before it is used.
    expect(refusedBy('a08-narrowing-outlives-a-call.ts')).toEqual(['no-stale-narrowing']);
    expect(refusedBy('b14-narrowed-let.ts')).toEqual(['no-stale-narrowing']);
    expect(refusedBy('b21-getter-narrowing.ts')).toEqual(['no-stale-narrowing']);
  });

  test('one is accepted, and is a call that throws: it is looked at with guarantee 3', () => {
    const accepted = Object.keys(attacks)
      .filter((name) => refusedBy(name).length === 0)
      .toSorted();
    // By family, with the task that is to close each: the Plane page « Review · guarantee 2, safe typing ».
    expect(accepted).toEqual([
      'a21-read-before-declaration.ts',
    ]);
  });
});
