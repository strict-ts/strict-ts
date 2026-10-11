import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const root = new URL('../', import.meta.url);

test('std has no dependency', () => {
  const manifest: unknown = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  expect(manifest).not.toHaveProperty('dependencies');
  expect(manifest).not.toHaveProperty('peerDependencies');
});

test('std imports nothing but its own files', () => {
  const src = new URL('src/', root);
  const files = readdirSync(src, { recursive: true, encoding: 'utf8' }).filter((name) => name.endsWith('.ts'));
  expect(files.length).toBeGreaterThan(0);
  const imported = /^(?:import|export)\b[^;]*?\bfrom\s+['"]([^'"]+)['"]/gm;
  const specifiers = files.flatMap((name) =>
    [...readFileSync(new URL(name, src), 'utf8').matchAll(imported)].map((m) => m[1]),
  );
  expect(specifiers.filter((specifier) => !specifier?.startsWith('./'))).toEqual([]);
});
