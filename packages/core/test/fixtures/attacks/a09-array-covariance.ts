// A mutable array of strings is taken for a mutable array of strings or numbers, and written to.
import type { Mut } from '@strict-ts/std';
const names: Mut<string[]> = ['a'];
const mixed: Mut<(string | number)[]> = names;
mixed.push(1);
for (const name of names) if (typeof name !== 'string') console.log('BROKEN a09: name is typed string and is', typeof name);
