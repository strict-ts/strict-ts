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

  test('what a function of the project gives back is written only if its return type says `Mut<…>`', () => {
    expect(refusedBy('m24-given-back-by-a-function.ts')).toEqual(['no-param-mutation']);
    expect(refusedBy('m25-handed-out-by-a-function.ts')).toEqual(['no-param-mutation']);
  });

  test('what is kept somewhere is not written from there unless the place says so', () => {
    // A second round, with the limits the documentation named each written as a file.
    for (const name of [
      'm26-arrow-kept-by-the-constructor.ts',
      'm27-written-straight-into-a-result.ts',
      'm28-through-map.ts',
      'm29-copy-of-a-result.ts',
      'm31-kept-in-a-field.ts',
      'm32-pushed-into-a-list.ts',
      'm33-called-with-call.ts',
      'm34-returned-inside-something-new.ts',
      'm35-captured-by-a-function-elsewhere.ts',
    ]) {
      expect(refusedBy(name), name).toEqual(['no-param-mutation']);
    }
    expect(refusedBy('m30-elements-of-a-list.ts')).toEqual(['mut-from-readonly']);
    // An iterator is used up by being read; and its `next` may throw, which is another rule's.
    expect(refusedBy('m36-iterator-of-a-parameter.ts')).toContain('no-param-mutation');
  });

  test('the third round: what is handed out, under any name or none, by the project or by the library', () => {
    // A part of `this` given where `Mut<…>` is asked, in a method that does not say `this: Mut<…>`.
    expect(refusedBy('m37-field-handed-out.ts')).toEqual(['mut-from-readonly']);
    expect(refusedBy('m41-this-by-another-name.ts')).toContain('no-param-mutation');
    // What a call gives, with no name for it; a new collection of the same things.
    expect(refusedBy('m38-result-with-no-name.ts')).toContain('no-param-mutation');
    expect(refusedBy('m39-new-collection.ts')).toEqual(['no-param-mutation']);
    expect(refusedBy('m45-new-list-where-mut-is-asked-inside.ts')).toEqual(['mut-from-readonly']);
    expect(refusedBy('m47-through-the-library.ts')).toContain('no-param-mutation');
    // A method that changes its object, reached another way than by calling it on the object.
    expect(refusedBy('m40-mutator-through-call.ts')).toContain('no-param-mutation');
    // A function that asks for `Mut<…>`, written where one that does not is asked for, or given to the library.
    expect(refusedBy('m42-function-written-in-place.ts')).toEqual(['mut-from-readonly']);
    expect(refusedBy('m44-callback-of-the-library.ts')).toEqual(['mut-from-readonly']);
    expect(refusedBy('m43-returned-by-another-name.ts')).toEqual(['mut-from-readonly']);
    // `Mut<…>` said of the list and not of what it holds, or of the keys of a map and not of its values.
    expect(refusedBy('m46-elements-of-a-result.ts')).toContain('no-param-mutation');
    expect(refusedBy('m48-mut-said-of-something-else.ts')).toEqual(['no-param-mutation']);
  }, 180_000);

  test('the fourth round: what a type hides, and a function given its arguments another way', () => {
    expect(refusedBy('m49-through-super.ts')).toContain('no-param-mutation');
    // An override, or an object given under a type whose members say less.
    expect(refusedBy('m50-override-that-says-more.ts')).toEqual(['mut-from-readonly']);
    expect(refusedBy('m51-under-a-quieter-type.ts')).toEqual(['mut-from-readonly']);
    expect(refusedBy('m52-given-by-call.ts')).toEqual(['mut-from-readonly']);
    expect(refusedBy('m53-through-a-proxy.ts')).toContain('no-param-mutation');
  }, 180_000);

  test('the fifth round: the short form of a property, a function under a quieter type, a pattern, `Object.assign`', () => {
    expect(refusedBy('m54-short-form.ts')).toEqual(['no-param-mutation']);
    expect(refusedBy('m55-function-under-a-quieter-type.ts')).toEqual(['mut-from-readonly']);
    expect(refusedBy('m56-pattern-assignment-of-names.ts')).toEqual(['no-param-mutation']);
    expect(refusedBy('m57-put-in-by-assign.ts')).toContain('no-param-mutation');
  }, 180_000);

  test('one is accepted, and is outside the guarantee: a value changed by who made it while someone else reads it', () => {
    const accepted = Object.keys(attacks)
      .filter((name) => refusedBy(name).length === 0)
      .toSorted();
    // Whoever made a value may change it; that another holds it as read-only at the same time is aliasing, which
    // is guarantee 5. The Plane page « Review · guarantee 4, explicit mutability » says why the line is there.
    expect(accepted).toEqual(['m12-inferred-and-viewed.ts']);
  });
});
