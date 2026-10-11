import { defaultConfig } from '@strict-ts/core';
import { none, some } from '@strict-ts/std';
import { expect, test } from 'vitest';
import { readConfig } from '../src/index.js';

const read = (content: unknown) => readConfig(some(content)).match({ ok: (config) => config, err: (error) => error });

test('no file gives the default configuration', () => {
  expect(readConfig(none).unwrapOr(undefined)).toEqual(defaultConfig);
  expect(read({})).toEqual(defaultConfig);
});

test('each key replaces its default', () => {
  expect(read({ unsafeDirs: ['lib/ffi'] })).toEqual({ ...defaultConfig, unsafeDirs: ['lib/ffi'] });
  expect(read({ allowedImports: [] })).toEqual({ ...defaultConfig, allowedImports: [] });
  expect(read({ rules: ['no-any'] })).toEqual({ ...defaultConfig, rules: ['no-any'] });
});

test('what is not understood is an error', () => {
  expect(read([])).toBe('strict-ts.json: object expected at the root');
  expect(read({ unsafeDirs: 'src/unsafe' })).toBe('strict-ts.json: array expected at .unsafeDirs');
  expect(read({ rules: ['no-any', 1] })).toBe('strict-ts.json: string expected at .rules[1]');
  expect(read({ rule: ['no-any'] })).toBe('strict-ts.json: unknown key "rule" (unsafeDirs, allowedImports, rules)');
  expect(read({ rules: ['no-anyy'] })).toBe('strict-ts.json: unknown rule "no-anyy"');
});
