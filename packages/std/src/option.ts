/** Option<T>: the equivalent of Rust's `std::option::Option`. Replaces `null`. */
import { Err, Ok, type Result } from './result.js';

abstract class OptionMethods {
  map<T, U>(this: Option<T>, f: (value: T) => U): Option<U> {
    return this.some ? new Some(f(this.value)) : none;
  }
  andThen<T, U>(this: Option<T>, f: (value: T) => Option<U>): Option<U> {
    return this.some ? f(this.value) : none;
  }
  unwrapOr<T, U>(this: Option<T>, fallback: U): T | U {
    return this.some ? this.value : fallback;
  }
  unwrapOrElse<T, U>(this: Option<T>, fallback: () => U): T | U {
    return this.some ? this.value : fallback();
  }
  /** Rust's `ok_or`: turns absence into an error. */
  okOr<T, const E>(this: Option<T>, error: E): Result<T, E> {
    return this.some ? new Ok(this.value) : new Err(error);
  }
  match<T, A, B>(this: Option<T>, arms: { some: (value: T) => A; none: () => B }): A | B {
    return this.some ? arms.some(this.value) : arms.none();
  }
}

export class Some<T> extends OptionMethods {
  readonly some = true as const;
  constructor(readonly value: T) {
    super();
  }
}

export class None extends OptionMethods {
  readonly some = false as const;
}

export type Option<T> = Some<T> | None;

export const some = <T>(value: T): Some<T> => new Some(value);
export const none: None = new None();

/** Converts a value that may be absent (array index, environment variable…) into an Option. */
export const fromUndefined = <T>(value: T | undefined): Option<T> => (value === undefined ? none : new Some(value));

export const Option = { from: fromUndefined, some, none } as const;

// ── v1 compatibility ───────────────────────────────────────────────
export const mapOption = <T, U>(o: Option<T>, f: (value: T) => U): Option<U> => o.map(f);
export const unwrapOrElse = <T>(o: Option<T>, fallback: () => T): T => o.unwrapOrElse(fallback);
