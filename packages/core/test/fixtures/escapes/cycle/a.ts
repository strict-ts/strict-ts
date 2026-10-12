// Two files that import each other: one reads the other's constant before it has a value.
import { b } from './b.js';
export const a = 1;
export const fromB = b;
