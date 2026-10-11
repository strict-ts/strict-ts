import { describe, expect, test } from 'vitest';
import './result-equality.js';
import { andThen, attempt, attemptAsync, Err, err, map, mapErr, match, Ok, ok, Result, unwrapOr } from '../src/index.js';

const parse = (text: string): Result<number, 'not-a-number'> => {
  const n = Number(text);
  return Number.isNaN(n) ? err('not-a-number') : ok(n);
};
const half = (n: number): Result<number, 'odd'> => (n % 2 === 0 ? ok(n / 2) : err('odd'));

describe('Ok and Err', () => {
  test('are discriminated on `ok`', () => {
    const good = parse('4');
    const bad = parse('x');
    expect(good.ok && good.value).toBe(4);
    expect(!bad.ok && bad.error).toBe('not-a-number');
    expect(good).toBeInstanceOf(Ok);
    expect(bad).toBeInstanceOf(Err);
  });

  test('map changes the value and leaves an error alone', () => {
    expect(parse('4').map((n) => n + 1)).toEqual(ok(5));
    expect(parse('x').map((n) => n + 1)).toEqual(err('not-a-number'));
  });

  test('mapErr changes the error and leaves a value alone', () => {
    expect(parse('x').mapErr((e) => e.length)).toEqual(err(12));
    expect(parse('4').mapErr((e) => e.length)).toEqual(ok(4));
  });

  test('andThen chains and stops at the first error', () => {
    expect(parse('4').andThen(half)).toEqual(ok(2));
    expect(parse('3').andThen(half)).toEqual(err('odd'));
    let called = false;
    const out = parse('x').andThen((n) => {
      called = true;
      return half(n);
    });
    expect(out).toEqual(err('not-a-number'));
    expect(called).toBe(false);
  });

  test('unwrapOr gives the value or the fallback', () => {
    expect(parse('4').unwrapOr(0)).toBe(4);
    expect(parse('x').unwrapOr(0)).toBe(0);
  });

  test('match runs the arm of the variant', () => {
    const arms = { ok: (n: number) => `ok ${n}`, err: (e: string) => `err ${e}` };
    expect(parse('4').match(arms)).toBe('ok 4');
    expect(parse('x').match(arms)).toBe('err not-a-number');
  });
});

describe('Result.gen', () => {
  const halfOf = (text: string) =>
    Result.gen(function* () {
      const n = yield* parse(text);
      const h = yield* half(n);
      return ok(h + 1);
    });

  test('yield* gives the value of an Ok', () => {
    expect(halfOf('4')).toEqual(ok(3));
  });

  test('yield* leaves at once with the first Err', () => {
    expect(halfOf('x')).toEqual(err('not-a-number'));
    expect(halfOf('3')).toEqual(err('odd'));
  });

  test('nothing after a failed yield* runs', () => {
    let reached = false;
    const out = Result.gen(function* () {
      yield* parse('x');
      reached = true;
      return ok(1);
    });
    expect(out).toEqual(err('not-a-number'));
    expect(reached).toBe(false);
  });

  test('the returned Result may itself be an Err', () => {
    const out = Result.gen(function* () {
      const n = yield* parse('3');
      return half(n);
    });
    expect(out).toEqual(err('odd'));
  });

  test('works with async generators', async () => {
    const later = async (text: string) => parse(text);
    const run = (text: string) =>
      Result.gen(async function* () {
        const n = yield* await later(text);
        return half(n);
      });
    await expect(run('4')).resolves.toEqual(ok(2));
    await expect(run('x')).resolves.toEqual(err('not-a-number'));
    await expect(run('3')).resolves.toEqual(err('odd'));
  });

  test('an Err resumed by hand throws', () => {
    const it = err('boom')[Symbol.iterator]();
    it.next();
    expect(() => it.next()).toThrow('must never be resumed');
  });
});

describe('attempt', () => {
  test('turns a return value into an Ok', () => {
    expect(attempt(() => JSON.parse('[1]') as unknown, String)).toEqual(ok([1]));
  });

  test('turns an exception into an Err', () => {
    const out = attempt((): unknown => JSON.parse('{'), () => 'invalid-json' as const);
    expect(out).toEqual(err('invalid-json'));
  });

  test('turns a resolved promise into an Ok', async () => {
    await expect(attempt(async () => 1, String)).resolves.toEqual(ok(1));
  });

  test('turns a rejected promise into an Err', async () => {
    const out = attempt(
      () => Promise.reject(new Error('down')),
      (cause) => (cause instanceof Error ? cause.message : 'unknown'),
    );
    await expect(out).resolves.toEqual(err('down'));
  });
});

describe('v1 free functions', () => {
  test('behave like the methods', async () => {
    expect(map(parse('4'), (n) => n + 1)).toEqual(ok(5));
    expect(mapErr(parse('x'), (e) => e.length)).toEqual(err(12));
    expect(andThen(parse('3'), half)).toEqual(err('odd'));
    expect(unwrapOr(parse('x'), 7)).toBe(7);
    expect(match(parse('4'), { ok: (n) => n, err: () => -1 })).toBe(4);
    await expect(attemptAsync(async () => 1, String)).resolves.toEqual(ok(1));
  });
});
