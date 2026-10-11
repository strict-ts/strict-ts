import { expect, test } from 'vitest';
import { run } from '../src/index.js';

test('no rule yet: every file passes', () => {
  const lines: string[] = [];
  expect(run(['a.ts'], (line) => lines.push(line))).toBe(0);
  expect(lines).toEqual([]);
});
