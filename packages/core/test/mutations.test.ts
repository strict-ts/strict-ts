// The known ways to change a value that its type says is read-only, or to change what a function receives when
// its parameter does not say `Mut`, with no `any` and no cast: each file of fixtures/mutations compiles under the
// strict options, and prints BROKEN when it is run. This test records which of them the rules refuse today. An
// attack that is accepted is a hole in guarantee 4: closing one changes a line here, and none may be closed by
// accident or reopened unseen.
import { describe, expect, test } from 'vitest';
import { checkFiles, fixture } from './project.js';

const page = { compilerOptions: { lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'] } };
const attacks = fixture('mutations');
// Each attack is checked once, whatever the number of tests that ask about it.
const checked = new Map<string, readonly string[]>();
const refusedBy = (name: string): readonly string[] => {
  const known = checked.get(name);
  if (known !== undefined) return known;
  const rules = [...new Set(checkFiles({ 'src/a.ts': attacks[name] ?? '' }, page).flatMap((d) => (d.file === 'src/a.ts' ? [d.rule] : [])))].toSorted();
  checked.set(name, rules);
  return rules;
};

describe('the attacks on explicit mutability', () => {
  test('each one compiles: what refuses it, if anything, is a rule and not the compiler', () => {
    for (const name of Object.keys(attacks)) expect(refusedBy(name).filter((rule) => rule.startsWith('TS')), name).toEqual([]);
    // Every file is compiled here, one program each: long on a busy machine.
  }, 180_000);

  test('a parameter that does not ask for mutation is not changed in the function, now or later', () => {
    expect(refusedBy('m13-readonly-given-to-inferred.ts')).toEqual(['no-param-mutation']);
    expect(refusedBy('m17-captured.ts')).toEqual(['no-param-mutation']);
  });

  test('a parameter is not changed through another name, a pattern, a loop or a function of the platform', () => {
    for (const name of [
      'm01-alias-of-a-parameter.ts',
      'm02-loop-variable.ts',
      'm03-destructured-local.ts',
      'm05-pattern-assignment.ts',
      'm06-loop-target.ts',
      'm07-reflect-set.ts',
      'm08-object-assign.ts',
      'm19-setter-of-the-platform.ts',
      'm20-found-in-a-parameter.ts',
      'm21-reassigned-alias.ts',
    ]) {
      expect(refusedBy(name), name).toEqual(['no-param-mutation']);
    }
  });

  test('a value typed read-only does not reach a type that can be written', () => {
    for (const name of [
      'm09-mut-through-a-property.ts',
      'm10-mut-through-an-assignment.ts',
      'm11-mut-through-an-element.ts',
      'm14-callback-parameter.ts',
      'm15-returned-as-mut.ts',
      'm16-this-parameter.ts',
    ]) {
      expect(refusedBy(name), name).toEqual(['mut-from-readonly']);
    }
  });

  test('a method changes its object only if it says `this: Mut<…>`, and is then called only on what may change', () => {
    expect(refusedBy('m04-mutating-method.ts')).toEqual(['no-param-mutation']);
    expect(refusedBy('m22-method-that-says-mut.ts')).toEqual(['no-param-mutation']);
    expect(refusedBy('m23-through-a-method-that-reads.ts')).toEqual(['no-param-mutation']);
  });

  test('one is accepted: a local with no written type, seen read-only by someone else', () => {
    const accepted = Object.keys(attacks)
      .filter((name) => refusedBy(name).length === 0)
      .toSorted();
    // The Plane page « Review · guarantee 4, explicit mutability » has the task that is to close it.
    expect(accepted).toEqual(['m12-inferred-and-viewed.ts']);
  });
});
