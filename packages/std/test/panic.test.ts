import { expect, test } from 'vitest';
import { panic, unreachable } from '../src/index.js';

test('panic stops the program with its message', () => {
  expect(() => panic('no permission')).toThrow('panic: no permission');
});

test('panic is usable as the last arm of ??', () => {
  const items: readonly string[] = ['a'];
  const head: string = items[0] ?? panic('empty');
  expect(head).toBe('a');
});

test('unreachable throws when the types were wrong at runtime', () => {
  type Shape = 'circle' | 'square';
  const sides = (shape: Shape): number => {
    switch (shape) {
      case 'circle':
        return 0;
      case 'square':
        return 4;
      default:
        return unreachable(shape);
    }
  };
  expect(sides('square')).toBe(4);
  expect(() => sides(JSON.parse('"triangle"'))).toThrow('unreachable: triangle');
});
