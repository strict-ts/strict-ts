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
