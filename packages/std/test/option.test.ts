import { describe, expect, test } from 'vitest';
import './result-equality.js';
import { err, fromUndefined, mapOption, none, ok, Option, some, unwrapOrElse } from '../src/index.js';

const first = (items: readonly number[]): Option<number> => Option.from(items[0]);

describe('Option', () => {
  test('from turns undefined into none and anything else into some', () => {
    expect(first([])).toBe(none);
    expect(first([3])).toEqual(some(3));
    expect(fromUndefined(0)).toEqual(some(0));
    expect(fromUndefined('')).toEqual(some(''));
  });

  test('is discriminated on `some`', () => {
    const present = first([3]);
    expect(present.some && present.value).toBe(3);
    expect(first([]).some).toBe(false);
  });

  test('map and andThen skip none', () => {
    expect(first([3]).map((n) => n * 2)).toEqual(some(6));
    expect(first([]).map((n) => n * 2)).toBe(none);
    expect(first([3]).andThen((n) => (n > 2 ? some(n) : none))).toEqual(some(3));
    expect(first([1]).andThen((n) => (n > 2 ? some(n) : none))).toBe(none);
  });

  test('unwrapOr and unwrapOrElse give the fallback only for none', () => {
    expect(first([3]).unwrapOr(0)).toBe(3);
    expect(first([]).unwrapOr(0)).toBe(0);
    expect(first([]).unwrapOrElse(() => 9)).toBe(9);
    let called = false;
    first([3]).unwrapOrElse(() => {
      called = true;
      return 0;
    });
    expect(called).toBe(false);
  });

  test('okOr turns absence into an error', () => {
    expect(first([3]).okOr('empty')).toEqual(ok(3));
    expect(first([]).okOr('empty')).toEqual(err('empty'));
  });

  test('match runs the arm of the variant', () => {
    const arms = { some: (n: number) => `some ${n}`, none: () => 'none' };
    expect(first([3]).match(arms)).toBe('some 3');
    expect(first([]).match(arms)).toBe('none');
  });

  test('v1 free functions behave like the methods', () => {
    expect(mapOption(first([3]), (n) => n + 1)).toEqual(some(4));
    expect(unwrapOrElse(first([]), () => 9)).toBe(9);
  });
});
