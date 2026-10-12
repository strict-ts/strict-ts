import { Err, Ok } from './result.js';

/**
 * How a test runner compares two Results. A Result is iterable (that is what `yield*` uses), and vitest and jest
 * compare iterables by iterating them: an Err on either side then throws « an Err must never be resumed ». Given
 * to the runner once, this makes `toEqual` compare the variant and what it holds:
 *
 *   import { expect } from 'vitest';
 *   import { resultEquality } from '@strict-ts/std';
 *   expect.addEqualityTesters([resultEquality]);
 */
export function resultEquality(this: { readonly equals: (a: unknown, b: unknown) => boolean }, a: unknown, b: unknown): boolean | undefined {
  // `instanceof` gives a Result of `any`: each side is read as one of `unknown`.
  const asOk = (value: unknown): Ok<unknown> | undefined => (value instanceof Ok ? value : undefined);
  const asErr = (value: unknown): Err<unknown> | undefined => (value instanceof Err ? value : undefined);
  const [okA, okB, errA, errB] = [asOk(a), asOk(b), asErr(a), asErr(b)];
  if (okA === undefined && okB === undefined && errA === undefined && errB === undefined) return undefined;
  if (okA !== undefined && okB !== undefined) return this.equals(okA.value, okB.value);
  if (errA !== undefined && errB !== undefined) return this.equals(errA.error, errB.error);
  return false;
}
