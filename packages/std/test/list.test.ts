import { describe, expect, test } from 'vitest';
import { type Mut, setAt } from '../src/index.js';

describe('setAt', () => {
  test('writes at a position the array has, and keeps its length', () => {
    const list: Mut<string[]> = ['a', 'b', 'c'];
    setAt(list, 1, 'B');
    setAt(list, list.length - 1, 'C');
    expect(list).toEqual(['a', 'B', 'C']);
  });

  test('stops the program at a position the array does not have', () => {
    const list: Mut<number[]> = [1];
    for (const index of [1, -1, 0.5, Number.NaN, 10]) expect(() => setAt(list, index, 2), String(index)).toThrow(/^panic: setAt: no position/);
    expect(list).toEqual([1]);
    expect(() => setAt([], 0, 1)).toThrow('panic: setAt: no position 0 in an array of 0');
  });
});
