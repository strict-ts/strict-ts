// A mutable array is lengthened by its length.
import type { Mut } from '@strict-ts/std';
const values: Mut<number[]> = [1];
values.length = 3;
for (const value of values) if (typeof value !== 'number') console.log('BROKEN a40: value is typed number and is', typeof value);
