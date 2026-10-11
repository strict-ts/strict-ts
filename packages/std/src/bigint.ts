import { type Option, none, some } from './option.js';

// The three operators that throw on a bigint, as functions that say so in their type.

/** `a / b`, or nothing when `b` is zero. */
export function quotient(a: bigint, b: bigint): Option<bigint> {
  try {
    return some(a / b);
  } catch {
    return none;
  }
}

/** `a % b`, or nothing when `b` is zero. */
export function remainder(a: bigint, b: bigint): Option<bigint> {
  try {
    return some(a % b);
  } catch {
    return none;
  }
}

/** `base ** exponent`, or nothing when the exponent is negative or the result too large to hold. */
export function power(base: bigint, exponent: bigint): Option<bigint> {
  try {
    return some(base ** exponent);
  } catch {
    return none;
  }
}
