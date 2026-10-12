// An element of a mutable array that is deleted: a hole.
import type { Mut } from '@strict-ts/std';
const values: Mut<number[]> = [1, 2];
delete values[0];
for (const value of values) if (typeof value !== 'number') console.log('BROKEN c02: value is typed number and is', typeof value);
