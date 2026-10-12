// A mutable tuple loses an element and keeps its type.
import type { Mut } from '@strict-ts/std';
const pair: Mut<[number, number]> = [1, 2];
pair.pop();
const [, second] = pair;
if (typeof second !== 'number') console.log('BROKEN a10: second is typed number and is', typeof second);
