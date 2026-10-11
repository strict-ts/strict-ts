import { expect, test } from 'vitest';
import { power, quotient, remainder } from '../src/index.js';

test('the bigint operators that throw give an Option', () => {
  expect(quotient(7n, 2n).unwrapOr(0n)).toBe(3n);
  expect(quotient(7n, 0n).some).toBe(false);
  expect(remainder(7n, 2n).unwrapOr(0n)).toBe(1n);
  expect(remainder(7n, 0n).some).toBe(false);
  expect(power(2n, 10n).unwrapOr(0n)).toBe(1024n);
  expect(power(2n, -1n).some).toBe(false);
});
