import type { Diagnostic, TypeProvider } from '@strict-ts/core';
import { expect, test } from 'vitest';
import { run } from '../src/index.js';

const program = (compilerDiagnostics: readonly Diagnostic[]): TypeProvider => ({
  files: [],
  compilerOptions: {},
  compilerDiagnostics,
  typeOf: () => expect.unreachable('no node to ask about'),
  exportsOf: () => [],
});

test('nothing refused: exit code 0 and no output', () => {
  const lines: string[] = [];
  expect(run(program([]), (line) => lines.push(line), { unsafeDirs: [], allowedImports: [], rules: [] })).toBe(0);
  expect(lines).toEqual([]);
});

test('a refusal is printed with its place and its help, and the exit code is 1', () => {
  const lines: string[] = [];
  const refused = { rule: 'TS2322', file: 'src/a.ts', start: { line: 3, column: 7 }, end: { line: 3, column: 8 }, message: 'no' };
  expect(run(program([refused]), (line) => lines.push(line))).toBe(1);
  expect(lines).toEqual([
    'src/a.ts:3:7 TS2322 no',
    'tsconfig.json:1:1 strict-compiler-options Required compiler options missing: strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, noImplicitReturns, noFallthroughCasesInSwitch, noImplicitOverride, noPropertyAccessFromIndexSignature.',
    '  help: Add to compilerOptions: "strict": true, "noUncheckedIndexedAccess": true, "exactOptionalPropertyTypes": true, "noImplicitReturns": true, "noFallthroughCasesInSwitch": true, "noImplicitOverride": true, "noPropertyAccessFromIndexSignature": true',
  ]);
});
