import { describe, expect, test } from 'vitest';
import './result-equality.js';
import { err, ok, s } from '../src/index.js';

describe('primitives', () => {
  test('accept their own type only', () => {
    expect(s.string.parse('a')).toEqual(ok('a'));
    expect(s.string.parse(1)).toEqual(err({ path: '', expected: 'string' }));
    expect(s.number.parse(1.5)).toEqual(ok(1.5));
    expect(s.number.parse('1')).toEqual(err({ path: '', expected: 'number' }));
    expect(s.boolean.parse(false)).toEqual(ok(false));
    expect(s.boolean.parse(0)).toEqual(err({ path: '', expected: 'boolean' }));
  });

  test('number refuses NaN and infinities', () => {
    expect(s.number.parse(Number.NaN).ok).toBe(false);
    expect(s.number.parse(Number.POSITIVE_INFINITY).ok).toBe(false);
  });
});

describe('literal', () => {
  const Status = s.literal('draft', 'sent');

  test('accepts the listed values only', () => {
    expect(Status.parse('sent')).toEqual(ok('sent'));
    expect(Status.parse('paid')).toEqual(err({ path: '', expected: '"draft" | "sent"' }));
  });
});

describe('date', () => {
  test('parses an ISO string into a Date', () => {
    const parsed = s.date.parse('2026-10-11T00:00:00.000Z');
    expect(parsed.ok && parsed.value.getTime()).toBe(Date.UTC(2026, 9, 11));
  });

  test('refuses what is not a date', () => {
    expect(s.date.parse('yesterday')).toEqual(err({ path: '', expected: 'ISO date' }));
    expect(s.date.parse(1791676800000)).toEqual(err({ path: '', expected: 'ISO date' }));
  });
});

describe('array', () => {
  test('parses every item', () => {
    expect(s.array(s.number).parse([1, 2])).toEqual(ok([1, 2]));
    expect(s.array(s.number).parse([])).toEqual(ok([]));
  });

  test('reports the index of the first bad item', () => {
    expect(s.array(s.number).parse([1, 'x', 'y'])).toEqual(err({ path: '[1]', expected: 'number' }));
    expect(s.array(s.number).parse({ length: 0 })).toEqual(err({ path: '', expected: 'array' }));
  });
});

describe('object', () => {
  const User = s.object({
    id: s.string,
    role: s.literal('admin', 'user'),
    tags: s.array(s.string),
    birth: s.optional(s.date),
  });

  test('parses a conforming object and drops unknown keys', () => {
    const parsed = User.parse({ id: 'u1', role: 'admin', tags: ['a'], extra: true });
    expect(parsed).toEqual(ok({ id: 'u1', role: 'admin', tags: ['a'] }));
  });

  test('an optional key is absent from the output, not undefined', () => {
    const parsed = User.parse({ id: 'u1', role: 'user', tags: [], birth: undefined });
    expect(parsed.ok && 'birth' in parsed.value).toBe(false);
  });

  test('an optional key present is parsed', () => {
    const parsed = User.parse({ id: 'u1', role: 'user', tags: [], birth: '2000-01-01' });
    expect(parsed.ok && parsed.value.birth).toEqual(new Date('2000-01-01'));
  });

  test('reports the path of the first bad field, nested', () => {
    expect(User.parse({ role: 'admin', tags: [] })).toEqual(err({ path: '.id', expected: 'string' }));
    expect(User.parse({ id: 'u1', role: 'admin', tags: ['a', 2] })).toEqual(err({ path: '.tags[1]', expected: 'string' }));
    expect(User.parse({ id: 'u1', role: 'admin', tags: [], birth: 'x' })).toEqual(
      err({ path: '.birth', expected: 'ISO date' }),
    );
  });

  test('refuses null, arrays and primitives', () => {
    for (const input of [null, [], 'x', 1, undefined]) {
      expect(User.parse(input)).toEqual(err({ path: '', expected: 'object' }));
    }
  });
});
