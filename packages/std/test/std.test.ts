import { expect, test } from 'vitest';
import * as std from '../src/index.js';

test('the package loads', () => {
  expect(std).toBeDefined();
});
