/**
 * Result<T, E>: the equivalent of Rust's `std::result::Result`, with methods.
 *
 * - `Ok<T> | Err<E>` stays a union discriminated on `ok`: `if (r.ok)` narrows the type.
 * - The methods (`map`, `andThen`…) are declared once with a `this` parameter, which lets them be called on the
 *   union without losing inference.
 * - Each variant is iterable: `yield*` in `Result.gen` plays the role of the `?` operator.
 */
abstract class ResultMethods {
  map<T, E, U>(this: Result<T, E>, f: (value: T) => U): Result<U, E> {
    return this.ok ? new Ok(f(this.value)) : this;
  }
  mapErr<T, E, F>(this: Result<T, E>, f: (error: E) => F): Result<T, F> {
    return this.ok ? this : new Err(f(this.error));
  }
  /** Rust's `and_then`: chains an operation that can itself fail. */
  andThen<T, E, U, F>(this: Result<T, E>, f: (value: T) => Result<U, F>): Result<U, E | F> {
    return this.ok ? f(this.value) : this;
  }
  unwrapOr<T, E, U>(this: Result<T, E>, fallback: U): T | U {
    return this.ok ? this.value : fallback;
  }
  match<T, E, A, B>(this: Result<T, E>, arms: { readonly ok: (value: T) => A; readonly err: (error: E) => B }): A | B {
    return this.ok ? arms.ok(this.value) : arms.err(this.error);
  }
}

export class Ok<T> extends ResultMethods {
  readonly ok = true as const;
  constructor(readonly value: T) {
    super();
  }
  // oxlint-disable-next-line require-yield -- an Ok never leaves `Result.gen`: it only returns its value to `yield*`
  *[Symbol.iterator](): Generator<never, T, unknown> {
    return this.value;
  }
}

export class Err<E> extends ResultMethods {
  readonly ok = false as const;
  constructor(readonly error: E) {
    super();
  }
  *[Symbol.iterator](): Generator<Err<E>, never, unknown> {
    yield this;
    throw new Error('Result.gen: an Err must never be resumed');
  }
}

export type Result<T, E> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => new Ok(value);
/** `const` parameter: `err("no-lines")` keeps the literal type "no-lines", without `as const`. */
export const err = <const E>(error: E): Err<E> => new Err(error);

type ErrorOf<X> = X extends Err<infer E> ? E : never;
type ValueOf<X> = X extends Ok<infer T> ? T : never;

/**
 * Rust's `?` operator: `const x = yield* r` gives the value of `r`, or leaves at once with its error.
 * The final error type is the union of every possible error, inferred.
 * Works with `function*` (returns a Result) and `async function*` (returns a Promise<Result>).
 */
function gen<Y extends Err<unknown> = never, R extends Result<unknown, unknown> = never>(
  body: () => AsyncGenerator<Y, R, unknown>,
): Promise<Result<ValueOf<R>, ErrorOf<Y> | ErrorOf<R>>>;
function gen<Y extends Err<unknown> = never, R extends Result<unknown, unknown> = never>(
  body: () => Generator<Y, R, unknown>,
): Result<ValueOf<R>, ErrorOf<Y> | ErrorOf<R>>;
function gen(body: () => Generator<unknown, unknown, unknown> | AsyncGenerator<unknown, unknown, unknown>): unknown {
  const steps = body();
  const step = steps.next();
  // Leaving on an Err closes the generator, so the `finally` blocks and `using` declarations it was in still run.
  // `return` throws on a generator that is running. This one is suspended at its `yield`; the `try` is for the rule,
  // which reads in the specification that `return` can throw and cannot see that it will not here.
  const close = (): unknown => {
    try {
      return steps.return(undefined);
    } catch {
      return undefined;
    }
  };
  if (step instanceof Promise) {
    return step.then(async (s) => {
      if (s.done !== true) await close();
      return s.value;
    });
  }
  // Here the generator is the synchronous one: what `return` gives back is not a promise, and nothing to wait for.
  if (step.done !== true) void close();
  return step.value;
}

/** For unsafe/: runs a function that may throw (synchronous or asynchronous) and returns a Result. */
export function attempt<T, E>(fn: () => Promise<T>, onError: (cause: unknown) => E): Promise<Result<T, E>>;
export function attempt<T, E>(fn: () => T, onError: (cause: unknown) => E): Result<T, E>;
export function attempt<T, E>(
  fn: () => T | Promise<T>,
  onError: (cause: unknown) => E,
): Result<T, E> | Promise<Result<T, E>> {
  try {
    const value = fn();
    if (value instanceof Promise) {
      return value.then(
        (v: T): Result<T, E> => new Ok(v),
        (cause: unknown): Result<T, E> => new Err(onError(cause)),
      );
    }
    return new Ok(value);
  } catch (cause) {
    return new Err(onError(cause));
  }
}

/** Rust-like entry point: `Result.gen(…)`, `Result.ok(…)`… */
export const Result = { gen, ok, err, attempt } as const;

// ── v1 compatibility: free-function versions ───────────────────────
export const map = <T, E, U>(r: Result<T, E>, f: (value: T) => U): Result<U, E> => r.map(f);
export const mapErr = <T, E, F>(r: Result<T, E>, f: (error: E) => F): Result<T, F> => r.mapErr(f);
export const andThen = <T, E, U, F>(r: Result<T, E>, f: (value: T) => Result<U, F>): Result<U, E | F> => r.andThen(f);
export const unwrapOr = <T, E>(r: Result<T, E>, fallback: T): T => r.unwrapOr(fallback);
export const match = <T, E, U>(r: Result<T, E>, arms: { readonly ok: (value: T) => U; readonly err: (error: E) => U }): U => r.match(arms);
export const attemptAsync = <T, E>(fn: () => Promise<T>, onError: (cause: unknown) => E): Promise<Result<T, E>> =>
  attempt(fn, onError);
