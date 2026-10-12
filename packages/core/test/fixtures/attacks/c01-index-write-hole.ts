// A write past the end of a mutable array leaves holes before it.
import type { Mut } from '@strict-ts/std';
const values: Mut<number[]> = [1];
values[3] = 4;
for (const value of values) if (typeof value !== 'number') console.log('BROKEN c01: value is typed number and is', typeof value);
