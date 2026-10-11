import { expect, test } from 'vitest';
import { check, type Rule } from '../src/index.js';

test('check gathers the diagnostics of every rule', () => {
  const rule: Rule = {
    name: 'always',
    guarantee: 'typing',
    check: (provider) =>
      provider.files.map((file) => ({
        rule: 'always',
        file,
        start: { line: 1, column: 1 },
        end: { line: 1, column: 2 },
        message: 'refused',
      })),
  };
  const found = check({ files: ['a.ts', 'b.ts'] }, [rule, rule]);
  expect(found.map((d) => d.file)).toEqual(['a.ts', 'b.ts', 'a.ts', 'b.ts']);
});
