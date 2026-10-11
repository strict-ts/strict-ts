/**
 * Validation schemas: the type is declared once and derived with `Infer`, the equivalent of
 * `#[derive(Deserialize)]` in Rust. Usage: `import { s } from "@strict-ts/std"`.
 *
 *   const User = s.object({ id: s.string, role: s.literal("admin", "user"), birth: s.optional(s.date) });
 *   type User = s.Infer<typeof User>;
 *   User.parse(json) // Result<User, SchemaError>
 */
import type { Mut } from './mut.js';
import { Err, Ok, type Result } from './result.js';

export type SchemaError = { readonly path: string; readonly expected: string };

export interface Schema<T> {
  readonly parse: (input: unknown) => Result<T, SchemaError>;
}

export interface OptionalSchema<T> extends Schema<T | undefined> {
  readonly optional: true;
}

export type Infer<S> = S extends Schema<infer T> ? T : never;

const fail = (expected: string): Err<SchemaError> => new Err({ path: '', expected });

function primitive<T>(expected: string, test: (input: unknown) => input is T): Schema<T> {
  return { parse: (input) => (test(input) ? new Ok(input) : fail(expected)) };
}

export const string = primitive('string', (x): x is string => typeof x === 'string');
export const number = primitive('number', (x): x is number => typeof x === 'number' && Number.isFinite(x));
export const boolean = primitive('boolean', (x): x is boolean => typeof x === 'boolean');

/** Union of literals: `s.literal("draft", "sent")` → Schema<"draft" | "sent">. */
export function literal<const V extends readonly (string | number | boolean)[]>(...values: V): Schema<V[number]> {
  const expected = values.map((v) => JSON.stringify(v)).join(' | ');
  return { parse: (input) => (values.includes(input as V[number]) ? new Ok(input as V[number]) : fail(expected)) };
}

/** Date in ISO format (JSON string) → Date. */
export const date: Schema<Date> = {
  parse: (input) => {
    if (typeof input !== 'string') return fail('ISO date');
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? fail('ISO date') : new Ok(d);
  },
};

export function array<T>(item: Schema<T>): Schema<readonly T[]> {
  return {
    parse: (input) => {
      if (!Array.isArray(input)) return fail('array');
      const out: Mut<T[]> = [];
      for (const [i, raw] of (input as readonly unknown[]).entries()) {
        const r = item.parse(raw);
        if (!r.ok) return new Err({ path: `[${i}]${r.error.path}`, expected: r.error.expected });
        out.push(r.value);
      }
      return new Ok(out);
    },
  };
}

export function optional<T>(inner: Schema<T>): OptionalSchema<T> {
  return { optional: true, parse: (input) => (input === undefined ? new Ok(undefined) : inner.parse(input)) };
}

type Shape = Readonly<Record<string, Schema<unknown>>>;
type Prettify<T> = { [K in keyof T]: T[K] } & {};
type RequiredKeys<S extends Shape> = { [K in keyof S]: S[K] extends OptionalSchema<unknown> ? never : K }[keyof S];
type OptionalKeys<S extends Shape> = Exclude<keyof S, RequiredKeys<S>>;
export type ObjectOf<S extends Shape> = Prettify<
  { readonly [K in RequiredKeys<S>]: Infer<S[K]> } & { readonly [K in OptionalKeys<S>]?: Exclude<Infer<S[K]>, undefined> }
>;

export function object<S extends Shape>(shape: S): Schema<ObjectOf<S>> {
  return {
    parse: (input) => {
      if (typeof input !== 'object' || input === null || Array.isArray(input)) return fail('object');
      const record = input as Readonly<Record<string, unknown>>;
      const out: Mut<Record<string, unknown>> = {};
      for (const [key, schema] of Object.entries(shape)) {
        const r = schema.parse(record[key]);
        if (!r.ok) return new Err({ path: `.${key}${r.error.path}`, expected: r.error.expected });
        if (r.value !== undefined) out[key] = r.value;
      }
      return new Ok(out as ObjectOf<S>);
    },
  };
}

// ── Constraints carried by the type ────────────────────────────────

/** The key of a brand. It is not exported: outside this file nothing can name it, so nothing can write a brand. */
const brand: unique symbol = Symbol('strict-ts brand');

/**
 * A `T` that passed the check named `B`. It is used wherever a `T` is, but a plain `T` is not accepted where it is
 * asked for: the only way to get one is the schema that checks it.
 *
 * The brand holds one key per check, so that checks add up: a number that is `Positive` and `Integer` is accepted
 * where a `Positive` one is asked, and not the other way round.
 */
export type Branded<T, B extends string> = T & { readonly [brand]: { readonly [K in B]: true } };

/**
 * A schema that also checks `test`, and says so in its type: `s.refine(s.number, 'Even', (n) => n % 2 === 0)` is a
 * `Schema<Branded<number, 'Even'>>`.
 */
export function refine<T, const B extends string>(inner: Schema<T>, name: B, test: (value: T) => boolean): Schema<Branded<T, B>> {
  return {
    parse: (input) => {
      const parsed = inner.parse(input);
      if (!parsed.ok) return parsed;
      // The one place a brand is given: the value has just passed the check the brand names.
      return test(parsed.value) ? new Ok(parsed.value as Branded<T, B>) : fail(name);
    },
  };
}

/** Gives a type its own name without checking more: a `CustomerId` that is not any string. */
export const branded = <T, const B extends string>(inner: Schema<T>, name: B): Schema<Branded<T, B>> => refine(inner, name, () => true);

/** A string or an array that holds at least one character or item. */
export const nonEmpty = <T extends { readonly length: number }>(inner: Schema<T>): Schema<Branded<T, 'NonEmpty'>> =>
  refine(inner, 'NonEmpty', (value) => value.length > 0);

/** A number above zero. Around another constrained number, it keeps that constraint too. */
export function positive(): Schema<Branded<number, 'Positive'>>;
export function positive<T extends number>(inner: Schema<T>): Schema<Branded<T, 'Positive'>>;
export function positive(inner: Schema<number> = number): Schema<Branded<number, 'Positive'>> {
  return refine(inner, 'Positive', (value) => value > 0);
}

/** A whole number. Around another constrained number, it keeps that constraint too. */
export function integer(): Schema<Branded<number, 'Integer'>>;
export function integer<T extends number>(inner: Schema<T>): Schema<Branded<T, 'Integer'>>;
export function integer(inner: Schema<number> = number): Schema<Branded<number, 'Integer'>> {
  return refine(inner, 'Integer', (value) => Number.isInteger(value));
}

/** A number between two bounds, both included. Every range has the same brand: name yours with `refine` to tell two apart. */
export const between = (min: number, max: number): Schema<Branded<number, 'Between'>> =>
  refine(number, 'Between', (value) => value >= min && value <= max);
