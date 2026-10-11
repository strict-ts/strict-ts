import type { Mut } from './mut.js';

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
