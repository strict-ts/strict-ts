import type { Mut } from './mut.js';

/**
 * A value as text, whatever it is. `String(value)` throws on a symbol in an array or on an object without a
 * prototype; this does not. An Error gives its message.
 */
export function textOf(value: unknown): string {
  if (value instanceof Error) return value.message;
  try {
    return String(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

/**
 * An object from pairs of a name and a value. `Object.fromEntries` throws on a key it cannot convert; here the keys
 * are strings. A pair named `__proto__` is left out: as a property it would change what the object is.
 */
export function record<V>(entries: readonly (readonly [string, V])[]): Readonly<Record<string, V>> {
  const made: Mut<Record<string, V>> = {};
  for (const [name, value] of entries) {
    if (name !== '__proto__') made[name] = value;
  }
  return made;
}
