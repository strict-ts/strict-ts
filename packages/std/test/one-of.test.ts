import { describe, expect, expectTypeOf, test } from 'vitest';
import { oneOf } from '../src/index.js';

describe('oneOf', () => {
  const KINDS = ['spam', 'promo'] as const;

  test('gives the value when the list holds it', () => {
    expect(oneOf(KINDS, 'promo')).toBe('promo');
    expect(oneOf([10, 25, 100], 25)).toBe(25);
    expect(oneOf([true], true)).toBe(true);
  });

  test('gives undefined for anything else', () => {
    expect(oneOf(KINDS, 'Promo')).toBeUndefined();
    expect(oneOf(KINDS, undefined)).toBeUndefined();
    expect(oneOf(KINDS, ['spam'])).toBeUndefined();
    expect(oneOf([10, 25, 100], '25')).toBeUndefined();
    expect(oneOf([], 'spam')).toBeUndefined();
  });

  test('the type is the union of the values, from a constant list or one written in place', () => {
    expectTypeOf(oneOf(KINDS, 'x')).toEqualTypeOf<'spam' | 'promo' | undefined>();
    expectTypeOf(oneOf(['a', 'b'], 'x')).toEqualTypeOf<'a' | 'b' | undefined>();
    const names: readonly string[] = ['a'];
    expectTypeOf(oneOf(names, 'x')).toEqualTypeOf<string | undefined>();
  });
});
