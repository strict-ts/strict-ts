import { describe, expect, test } from 'vitest';
import './result-equality.js';
import { err, ok, s } from '../src/index.js';

describe('constrained schemas', () => {
  test('nonEmpty refuses an empty string or array, and keeps the value otherwise', () => {
    expect(s.nonEmpty(s.string).parse('a')).toEqual(ok('a'));
    expect(s.nonEmpty(s.string).parse('')).toEqual(err({ path: '', expected: 'NonEmpty' }));
    expect(s.nonEmpty(s.array(s.number)).parse([1])).toEqual(ok([1]));
    expect(s.nonEmpty(s.array(s.number)).parse([])).toEqual(err({ path: '', expected: 'NonEmpty' }));
  });

  test('positive, integer and between check numbers', () => {
    expect(s.positive().parse(1)).toEqual(ok(1));
    expect(s.positive().parse(0).ok).toBe(false);
    expect(s.integer().parse(2)).toEqual(ok(2));
    expect(s.integer().parse(2.5).ok).toBe(false);
    expect(s.between(1, 3).parse(3)).toEqual(ok(3));
    expect(s.between(1, 3).parse(4)).toEqual(err({ path: '', expected: 'Between' }));
  });

  test('a constraint still refuses what its inner schema refuses, with that reason', () => {
    expect(s.positive().parse('1')).toEqual(err({ path: '', expected: 'number' }));
    expect(s.nonEmpty(s.string).parse(1)).toEqual(err({ path: '', expected: 'string' }));
  });

  test('constraints stack, and each can refuse', () => {
    const Quantity = s.positive(s.integer());
    expect(Quantity.parse(3)).toEqual(ok(3));
    expect(Quantity.parse(-3)).toEqual(err({ path: '', expected: 'Positive' }));
    expect(Quantity.parse(1.5)).toEqual(err({ path: '', expected: 'Integer' }));
  });

  test('refine names a check of your own, and branded names a type without a check', () => {
    const Even = s.refine(s.number, 'Even', (n) => n % 2 === 0);
    expect(Even.parse(4)).toEqual(ok(4));
    expect(Even.parse(3)).toEqual(err({ path: '', expected: 'Even' }));
    expect(s.branded(s.string, 'CustomerId').parse('c1')).toEqual(ok('c1'));
  });

  test('a constrained field reports its path inside an object', () => {
    const Line = s.object({ label: s.nonEmpty(s.string), quantity: s.positive() });
    expect(Line.parse({ label: 'a', quantity: 2 })).toEqual(ok({ label: 'a', quantity: 2 }));
    expect(Line.parse({ label: '', quantity: 2 })).toEqual(err({ path: '.label', expected: 'NonEmpty' }));
    expect(Line.parse({ label: 'a', quantity: 0 })).toEqual(err({ path: '.quantity', expected: 'Positive' }));
  });

  test('the brand is not a property of the value at runtime', () => {
    const parsed = s.nonEmpty(s.array(s.number)).parse([1]);
    expect(parsed.ok && Object.getOwnPropertySymbols(parsed.value)).toEqual([]);
    expect(parsed.ok && JSON.stringify(parsed.value)).toBe('[1]');
  });
});
