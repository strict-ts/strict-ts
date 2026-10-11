import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { derive } from '../scripts/derive.mjs';
import { analyse, clauses, declaredNames, facts, REFUSES, resolve } from '../scripts/spec.mjs';
import { generate, sequence, show } from '../scripts/values.mjs';

const page = `
<emu-clause id="sec-outer">
  <h1>Outer</h1>
  <emu-clause id="sec-string.prototype.repeat">
    <h1>String.prototype.repeat ( _count_ )</h1>
    <emu-alg>
      1. Let _O_ be ? RequireObjectCoercible(*this* value).
      1. Let _S_ be ? ToString(_O_).
      1. Let _n_ be ? ToIntegerOrInfinity(_count_).
      1. If _n_ &lt; 0 or _n_ = +∞, throw a *RangeError* exception.
      1. Return the String value.
    </emu-alg>
  </emu-clause>
  <emu-clause id="sec-array.prototype.map">
    <h1>Array.prototype.map ( _callbackfn_ [ , _thisArg_ ] )</h1>
    <emu-alg>
      1. Let _O_ be ? ToObject(*this* value).
      1. If IsCallable(_callbackfn_) is *false*, throw a *TypeError* exception.
      1. Let _mapped_ be ? Call(_callbackfn_, _thisArg_, « »).
      1. Return _A_.
    </emu-alg>
  </emu-clause>
  <emu-clause id="sec-math.abs">
    <h1>Math.abs ( _x_ )</h1>
    <emu-alg>
      1. Let _n_ be ? ToNumber(_x_).
      1. Return the absolute value of _n_.
    </emu-alg>
  </emu-clause>
  <emu-clause id="sec-decode" type="abstract operation">
    <h1>Decode ( _string_: a String, ): either a normal completion containing a String or a throw completion</h1>
    <emu-alg>
      1. If _k_ + 2 ≥ _strLen_, throw a *URIError* exception.
    </emu-alg>
  </emu-clause>
  <emu-clause id="sec-decodeuricomponent-encodeduricomponent">
    <h1>decodeURIComponent ( _encodedURIComponent_ )</h1>
    <emu-alg>
      1. Let _componentString_ be ? ToString(_encodedURIComponent_).
      1. Return ? Decode(_componentString_).
    </emu-alg>
  </emu-clause>
  <emu-clause id="sec-mystery">
    <h1>Mystery.run ( )</h1>
    <emu-alg>
      1. Return ? SomethingThisReaderDoesNotKnow().
    </emu-alg>
  </emu-clause>
</emu-clause>`;

describe('reading the specification', () => {
  const read = analyse(facts(page));
  const declared = (...kinds: readonly (readonly object[])[]) => ({ signatures: kinds.map((params) => ({ params: params.map((type) => ({ type, optional: false, rest: false })) })) });
  const string = { k: 'string' };
  const number = { k: 'number' };
  const anything = { k: 'any' };
  const callback = { k: 'function', arity: 1, returns: { k: 'any' } };

  test('splits the document into clauses, each with its own algorithm', () => {
    expect(clauses(page).map((clause) => clause.id)).toEqual([
      'sec-string.prototype.repeat',
      'sec-array.prototype.map',
      'sec-math.abs',
      'sec-decode',
      'sec-decodeuricomponent-encodeduricomponent',
      'sec-mystery',
      'sec-outer',
    ]);
  });

  test('follows where each value comes from: the receiver, a parameter, a primitive the algorithm made', () => {
    const repeat = facts(page).find((clause) => clause.name === 'String.prototype.repeat');
    expect(repeat?.params).toEqual(['count']);
    expect(repeat?.passes).toEqual([
      { to: 'RequireObjectCoercible', given: ['this'] },
      { to: 'ToString', given: ['this'] },
      { to: 'ToIntegerOrInfinity', given: ['param:count'] },
    ]);
    // `_n_` was made by a conversion: the step that throws tests a primitive, not the argument.
    expect(repeat?.throws[0]?.about).toEqual(['plain']);
  });

  test('a step that throws on a value is a real way to throw', () => {
    expect(read.get('String.prototype.repeat')?.real[0]).toMatch(/^RangeError: If _n_ /);
    expect(read.get('String.prototype.repeat')?.conversions).toEqual([{ op: 'ToIntegerOrInfinity', on: 'param:count' }]);
  });

  test('a check that a parameter is callable is asked of its declared type', () => {
    const map = read.get('Array.prototype.map');
    expect(map?.real).toEqual([]);
    expect(map?.guards).toEqual([{ on: 'param:callbackfn', accepts: ['function'], reason: 'TypeError: If IsCallable(_callbackfn_) is *false*, throw a *TypeError* exception.' }]);
    expect(map === undefined ? undefined : resolve(map, declared([callback, anything])).real).toEqual([]);
    // Declared loosely, the same function could be given what the check refuses.
    expect(map === undefined ? undefined : resolve(map, declared([anything, anything])).real[0]).toMatch(/the declared type admits string, number/);
  });

  test('a conversion can fail only on what the declared type lets in', () => {
    const abs = read.get('Math.abs');
    expect(abs?.conversions).toEqual([{ op: 'ToNumber', on: 'param:x' }]);
    expect(abs === undefined ? undefined : resolve(abs, declared([number])).converts).toBe('no');
    expect(abs === undefined ? undefined : resolve(abs, declared([string])).converts).toBe('no');
    expect(abs === undefined ? undefined : resolve(abs, declared([{ k: 'bigint' }])).converts).toBe('primitive');
    expect(abs === undefined ? undefined : resolve(abs, declared([anything])).converts).toBe('object');
  });

  test('what an operation throws is handed on to the function that calls it with `?`', () => {
    expect(read.get('decodeURIComponent')?.real).toEqual(['via Decode: URIError: If _k_ + 2 ≥ _strLen_, throw a *URIError* exception.']);
    expect(read.has('Decode')).toBe(false);
  });

  test('an operation the reader does not know may throw', () => {
    expect(read.get('Mystery.run')?.real).toEqual(['? SomethingThisReaderDoesNotKnow']);
  });

  test('each conversion refuses what running it refuses', () => {
    const values: Readonly<Record<string, unknown>> = { undefined, null: null, string: 'a', number: 1, bigint: 1n, boolean: true, symbol: Symbol('s'), object: Object.create(null) };
    const run: Readonly<Record<string, (value: unknown) => unknown>> = {
      ToString: (value) => `${value as string}`,
      ToNumber: (value) => Math.abs(value as number),
      ToNumeric: (value) => -(value as number),
      ToIntegerOrInfinity: (value) => 'a'.repeat(value as number),
      ToObject: (value) => Object.keys(value as object),
      ToPropertyKey: (value) => ({})[value as string],
      ToBigInt: (value) => new BigInt64Array(1).fill(value as bigint),
      ToUint32: (value) => Math.clz32(value as number),
    };
    for (const [op, convert] of Object.entries(run)) {
      const refused = Object.entries(values).filter(([, value]) => {
        try {
          convert(value);
          return false;
        } catch {
          return true;
        }
      });
      expect(refused.map(([kind]) => kind).toSorted(), op).toEqual([...(REFUSES[op] ?? [])].toSorted());
    }
  });

  test('names are those of the compiler\'s declarations', () => {
    expect(declaredNames('Array.prototype.map')).toEqual(['Array.map', 'ReadonlyArray.map']);
    expect(declaredNames('String.fromCodePoint')).toEqual(['StringConstructor.fromCodePoint']);
    expect(declaredNames('Math.abs')).toEqual(['Math.abs']);
    expect(declaredNames('RegExp')).toEqual(['RegExpConstructor.', 'RegExpConstructor.new']);
    expect(declaredNames('decodeURIComponent')).toEqual(['decodeURIComponent']);
    expect(declaredNames('parseInt')).toEqual(['parseInt', 'NumberConstructor.parseInt']);
    expect(declaredNames('Array.prototype [ @@iterator ]')).toEqual([]);
    expect(declaredNames('%TypedArray%.prototype.at')).toHaveLength(11);
  });

  test('the facts kept in the repo are those of ECMAScript 2023, and say what is known of a few functions', () => {
    const kept = JSON.parse(readFileSync(new URL('../spec/facts.json', import.meta.url), 'utf8'));
    expect(kept.edition).toBe('es2023');
    const all = analyse(kept.clauses);
    expect(all.size).toBeGreaterThan(600);
    expect(all.get('Array.prototype.map')).toMatchObject({ real: [], conversions: [] });
    expect(all.get('String.prototype.repeat')?.real.join()).toContain('RangeError');
    expect(all.get('decodeURIComponent')?.real.join()).toContain('URIError');
    expect(all.get('Math.round')).toMatchObject({ real: [], conversions: [{ op: 'ToNumber', on: 'param:x' }] });
    // `padEnd` hands its arguments to an operation, which converts them: said of the arguments of `padEnd`.
    expect(all.get('String.prototype.padEnd')?.conversions).toEqual([
      { op: 'ToLength', on: 'param:maxLength' },
      { op: 'ToString', on: 'param:fillString' },
    ]);
    // What a comparator returns is converted to a number: its declared return type says whether that can fail.
    expect(all.get('Array.prototype.sort')?.conversions).toContainEqual({ op: 'ToNumber', on: 'returns:comparefn' });
  });
});

describe('deriving entries', () => {
  const declared = (name: string) => ({ name, owner: '', member: name, runnable: true, signatures: [] });
  const never = { located: true, modes: { plain: { 1: { runs: 300, threw: 0 } }, any: { 1: { runs: 300, threw: 0 } } } };
  const threw = { located: true, modes: { plain: { 1: { runs: 300, threw: 9, example: '("%") → URIError' } }, any: { 1: { runs: 300, threw: 9 } } } };
  const odd = { located: true, modes: { plain: { 0: { runs: 300, threw: 0 } }, any: { 0: { runs: 300, threw: 4, example: '[Symbol()] · () → TypeError' } } } };
  const spec = (real: readonly string[], converts: 'no' | 'primitive' | 'object' = 'no') => ({ id: 'sec-x', real, converts, detached: false });
  const entryOf = (observed: object, specified?: object, acknowledged: Record<string, string> = {}) => {
    const { entries, contradictions, quiet } = derive([declared('f')], { f: observed }, new Map(specified === undefined ? [] : [['f', specified]]), acknowledged);
    return { entry: entries[0], contradictions, quiet };
  };

  test('total needs both: a specification without a way to throw, and runs that never threw', () => {
    expect(entryOf(never, spec([])).entry).toEqual({ name: 'f', verdict: 'total', evidence: { runs: 600, spec: 'sec-x' } });
    // A conversion that refuses a kind the runs always try (a number where a bigint is wanted), and never threw.
    expect(entryOf(never, spec([], 'primitive')).entry?.verdict).toBe('total');
    // One that refuses some objects, which the declared types let in: no run can try every object.
    expect(entryOf(never, spec([], 'object')).entry).toMatchObject({ verdict: 'throws', unprintable: true });
    expect(entryOf(never).entry).toBeUndefined();
    expect(entryOf(never).quiet).toEqual({ f: 600 });
  });

  test('a real way to throw in the specification is kept even when no run found it', () => {
    expect(entryOf(never, spec(['RangeError: If _n_ is too large'])).entry).toMatchObject({ verdict: 'throws', why: 'may throw by the specification (RangeError: If _n_ is too large)' });
  });

  test('what was seen to throw says so, with the call', () => {
    expect(entryOf(threw, spec(['URIError: …'])).entry).toMatchObject({ verdict: 'throws', why: 'throws a URIError, as seen with ("%")' });
    expect(entryOf(odd, spec([], 'object')).entry).toMatchObject({ verdict: 'throws', unprintable: true });
  });

  test('a function that threw although the specification gives it no way to is a contradiction', () => {
    expect(entryOf(threw, spec([])).contradictions).toEqual([{ name: 'f', seen: '("%") → URIError', spec: 'sec-x', acknowledged: undefined }]);
    expect(entryOf(threw, spec([]), { f: 'understood' }).contradictions[0]?.acknowledged).toBe('understood');
    expect(entryOf(threw, spec([])).entry?.verdict).toBe('throws');
    expect(entryOf(threw, spec([], 'object')).contradictions).toEqual([]);
  });

  test('the condition on the number of arguments comes from the runs', () => {
    const reduce = { located: true, modes: { plain: { 1: { runs: 150, threw: 30, example: '[] · (function) → TypeError' }, 2: { runs: 150, threw: 0 } }, any: {} } };
    expect(entryOf(reduce).entry).toMatchObject({ verdict: 'throws', below: 2 });
    const radix = { located: true, modes: { plain: { 0: { runs: 150, threw: 0 }, 1: { runs: 150, threw: 30, example: '1 · (99) → RangeError' } }, any: {} } };
    expect(entryOf(radix).entry).toMatchObject({ verdict: 'throws', atLeast: 1 });
  });
});

describe('generating values', () => {
  test('the same seed gives the same values', () => {
    const make = () => {
      const random = sequence(7);
      return Array.from({ length: 20 }, () => show(generate({ k: 'union', of: [{ k: 'string' }, { k: 'number' }, { k: 'array', of: { k: 'any' } }] }, random, false)));
    };
    expect(make()).toEqual(make());
  });

  test('plain values are strings, numbers, booleans, null and undefined; anything adds what cannot be converted', () => {
    const kinds = (plain: boolean) => {
      const random = sequence(3);
      return new Set(Array.from({ length: 400 }, () => typeof generate({ k: 'any' }, random, plain)));
    };
    expect([...kinds(true)].toSorted()).toEqual(['boolean', 'number', 'object', 'string', 'undefined']);
    expect(kinds(false).has('symbol')).toBe(true);
    expect(kinds(false).has('function')).toBe(true);
  });

  test('a value fits the type it was asked for', () => {
    const random = sequence(11);
    expect(typeof generate({ k: 'string' }, random, true)).toBe('string');
    expect(generate({ k: 'literal', v: 'x' }, random, true)).toBe('x');
    expect(Array.isArray(generate({ k: 'array', of: { k: 'number' } }, random, true))).toBe(true);
    expect(generate({ k: 'library', name: 'Date' }, random, true)).toBeInstanceOf(Date);
    expect(typeof generate({ k: 'function', arity: 1, returns: { k: 'number' } }, random, true)).toBe('function');
    expect(typeof generate({ k: 'objectLike' }, random, true)).toBe('object');
  });
});

describe('operators and accessors', () => {
  test('the operators that throw are found by running them, and kept only where the compiler accepts the operands', async () => {
    const { operators } = await import('../scripts/operators.mjs');
    const { table } = operators();
    expect(table['/ bigint bigint']).toBe('throws a RangeError, as seen with 0n / 0n');
    expect(table['template object']).toMatch(/^throws a TypeError/);
    // The compiler refuses a number mixed with a bigint: the exception is real and nobody can write it.
    expect(table['+ number bigint']).toBeUndefined();
    // Never threw on any pair of values.
    expect(table['/ number number']).toBeUndefined();
    expect(table['< Date Date']).toBeUndefined();
    expect(table['template Date']).toBeUndefined();
  });

  test('an accessor is found on the object it is read from: only what is not a check of the receiver is kept', async () => {
    const { throwingGetters } = await import('../scripts/spec.mjs');
    const kept = JSON.parse(readFileSync(new URL('../spec/facts.json', import.meta.url), 'utf8'));
    expect(Object.keys(throwingGetters(analyse(kept.clauses)))).toEqual(['DataView.byteLength', 'DataView.byteOffset']);
  });
});
