import { expect, test } from 'vitest';
import { parseArgs } from '../src/index.js';

const parsed = (...argv: readonly string[]) => parseArgs(argv).match({ ok: (command) => command, err: (error) => error });

test('no argument checks the current directory as text', () => {
  expect(parsed()).toEqual({ kind: 'check', project: undefined, format: 'text', baseline: 'use', strictBaseline: false });
});

test('options take their value from the next argument or after =', () => {
  expect(parsed('-p', 'app', '--format', 'json')).toEqual({ kind: 'check', project: 'app', format: 'json', baseline: 'use', strictBaseline: false });
  expect(parsed('--project=app/tsconfig.json', '--format=text')).toEqual({
    kind: 'check',
    project: 'app/tsconfig.json',
    format: 'text',
    baseline: 'use',
    strictBaseline: false,
  });
});

test('help wins over what follows', () => {
  expect(parsed('-h', '--nope')).toEqual({ kind: 'help' });
});

test('what is not understood is an error', () => {
  expect(parsed('--watch')).toBe('unknown argument: --watch');
  expect(parsed('-p')).toBe('-p needs a value');
  expect(parsed('--project=')).toBe('--project needs a value');
  expect(parsed('--format', 'xml')).toBe('unknown format: xml (text or json)');
  expect(parsed('-p=app')).toBe('unknown argument: -p=app');
});

test('--update-baseline is a flag, and refuses a format', () => {
  expect(parsed('--update-baseline', '-p', 'app')).toEqual({ kind: 'check', project: 'app', format: 'text', baseline: 'update', strictBaseline: false });
  expect(parsed('--update-baseline', '--format', 'json')).toBe('--update-baseline cannot be combined with --format');
  expect(parsed('--update-baseline=yes')).toBe('unknown argument: --update-baseline=yes');
});

test('--no-baseline ignores the baseline, and cannot go with --update-baseline', () => {
  expect(parsed('--no-baseline')).toEqual({ kind: 'check', project: undefined, format: 'text', baseline: 'ignore', strictBaseline: false });
  expect(parsed('--no-baseline', '--update-baseline')).toBe('--update-baseline cannot be combined with --no-baseline');
});

test('--strict-baseline needs a baseline to be strict about', () => {
  expect(parsed('--strict-baseline')).toEqual({ kind: 'check', project: undefined, format: 'text', baseline: 'use', strictBaseline: true });
  expect(parsed('--strict-baseline', '--no-baseline')).toBe('--strict-baseline cannot be combined with --no-baseline');
  expect(parsed('--strict-baseline', '--update-baseline')).toBe('--strict-baseline cannot be combined with --update-baseline');
});
