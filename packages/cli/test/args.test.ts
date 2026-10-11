import { expect, test } from 'vitest';
import { parseArgs } from '../src/index.js';

const parsed = (...argv: readonly string[]) => parseArgs(argv).match({ ok: (command) => command, err: (error) => error });

test('no argument checks the current directory as text', () => {
  expect(parsed()).toEqual({ kind: 'check', project: undefined, format: 'text' });
});

test('options take their value from the next argument or after =', () => {
  expect(parsed('-p', 'app', '--format', 'json')).toEqual({ kind: 'check', project: 'app', format: 'json' });
  expect(parsed('--project=app/tsconfig.json', '--format=text')).toEqual({
    kind: 'check',
    project: 'app/tsconfig.json',
    format: 'text',
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
