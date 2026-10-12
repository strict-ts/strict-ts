// A class with a property that can be written, seen under a wider type: a number is written into a cell of texts.
import type { Mut } from '@strict-ts/std';
class Cell<T> {
  constructor(public value: Mut<T>) {}
}
const text = new Cell<string>('a');
const wider: Cell<string | number> = text;
wider.value = 1;
if (typeof text.value !== 'string') console.log('BROKEN c04: value is typed string and is', typeof text.value);
