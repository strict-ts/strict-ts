import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rules } from '@strict-ts/core';
import { some } from '@strict-ts/std';
import Ajv from 'ajv';
import { describe, expect, test } from 'vitest';
import { configSchema, readSettings, serializeConfigSchema } from '../src/index.js';

const published = fileURLToPath(new URL('../strict-ts.schema.json', import.meta.url));
const validate = new Ajv().compile(configSchema);

test('the published file is generated from the source: run `pnpm --filter @strict-ts/cli schema` after a change', () => {
  expect(readFileSync(published, 'utf8')).toBe(serializeConfigSchema());
});

test('the package publishes the schema', () => {
  const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));
  expect(manifest.files).toContain('strict-ts.schema.json');
});

test('the schema lists every rule of the catalogue', () => {
  expect(configSchema.properties.rules.items.enum).toEqual(rules.map((rule) => rule.name));
});

describe('the schema and the CLI agree on what a strict-ts.json may hold', () => {
  const accepted: readonly unknown[] = [
    {},
    { $schema: './node_modules/@strict-ts/cli/strict-ts.schema.json' },
    { unsafeDirs: ['lib/ffi'], allowedImports: [], rules: ['no-any', 'no-cast'], baseline: 'ci/baseline.json' },
    { unsafeDirs: [] },
  ];
  const refused: readonly unknown[] = [
    [],
    { unsafeDir: ['src/unsafe'] },
    { unsafeDirs: 'src/unsafe' },
    { rules: ['no-cats'] },
    { rules: 'no-any' },
    { baseline: '' },
    { baseline: 1 },
    { allowedImports: [1] },
  ];

  test.each(accepted)('accepts %j', (content) => {
    expect(validate(content)).toBe(true);
    expect(readSettings(some(content)).ok).toBe(true);
  });

  test.each(refused)('refuses %j', (content) => {
    expect(validate(content)).toBe(false);
    expect(readSettings(some(content)).ok).toBe(false);
  });
});
