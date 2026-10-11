import { textOf } from './text.js';

/**
 * Bugs are not domain errors: like `panic!` and `unreachable!` in Rust, they stop the program instead of weighing
 * on every error type. Result stays reserved for what the caller really has to handle.
 */
export function panic(message: string): never {
  throw new Error(`panic: ${message}`);
}

/** To put where the compiler proves that no case is left (`value` has type never). */
export function unreachable(value: never): never {
  throw new Error(`unreachable: ${textOf(value)}`);
}
