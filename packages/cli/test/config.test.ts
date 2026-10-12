import { defaultConfig } from '@strict-ts/core';
import { none, some } from '@strict-ts/std';
import { expect, test } from 'vitest';
import { defaultSettings, readSettings } from '../src/index.js';

const read = (content: unknown) =>
  readSettings(some(content)).match({ ok: (settings) => settings.config, err: (error) => error });

test('no file gives the default configuration', () => {
  expect(readSettings(none).unwrapOr(undefined)).toEqual(defaultSettings);
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
  expect(read({ rule: ['no-any'] })).toBe('strict-ts.json: unknown key "rule" (unsafeDirs, allowedImports, pureDirs, testDirs, assume, rules, baseline)');
  expect(read({ rules: ['no-anyy'] })).toBe('strict-ts.json: unknown rule "no-anyy"');
});

test('the baseline path defaults to strict-ts-baseline.json and can be set', () => {
  const baseline = (content: unknown) => readSettings(some(content)).match({ ok: (settings) => settings.baseline, err: (error) => error });
  expect(baseline({})).toBe('strict-ts-baseline.json');
  expect(baseline({ baseline: 'ci/baseline.json' })).toBe('ci/baseline.json');
  expect(baseline({ baseline: '' })).toBe('strict-ts.json: "baseline" is empty');
  expect(baseline({ baseline: 1 })).toBe('strict-ts.json: string expected at .baseline');
});

test('pureDirs names the directories that must be pure', () => {
  expect(read({ pureDirs: ['src/domain'] })).toEqual({ ...defaultConfig, pureDirs: ['src/domain'] });
  expect(read({ pureDirs: 'src/domain' })).toBe('strict-ts.json: array expected at .pureDirs');
});

test('an assumption is one the rules know', () => {
  expect(read({ assume: ['attached-buffers'] })).toEqual({ ...defaultConfig, assume: ['attached-buffers'] });
  expect(read({ assume: ['no-bugs'] })).toBe('strict-ts.json: unknown assumption "no-bugs" (attached-buffers, dom-as-observed, generated-arguments, generated-receivers)');
});
