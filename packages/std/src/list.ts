import type { Mut } from './mut.js';
import { panic } from './panic.js';

/**
 * Writes `value` at a position the array has. `list[index] = value` writes anywhere: past the end it leaves holes
 * that are typed as elements, and at -1 it adds a property that is no element at all. Here a position the array
 * does not have is a bug, and stops the program: to add an element, `push`.
 */
export function setAt<T>(list: Mut<T[]>, index: number, value: T): void {
  if (!Number.isInteger(index) || index < 0 || index >= list.length) panic(`setAt: no position ${index} in an array of ${list.length}`);
  list.splice(index, 1, value);
}
