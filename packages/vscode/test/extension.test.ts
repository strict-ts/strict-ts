import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));

test('the extension hands the plugin to the editor, for the TypeScript of the workspace too', () => {
  const manifest = JSON.parse(readFileSync(`${dist}extension/package.json`, 'utf8'));
  expect(manifest.contributes.typescriptServerPlugins).toEqual([{ name: '@strict-ts/language-service', enableForWorkspaceTypeScriptVersions: true }]);
  // Nothing of its own runs in the editor: it has no entry point.
  expect(manifest.main).toBeUndefined();
});

test('the plugin is where the TypeScript server looks for it, and is the factory it expects', () => {
  const require = createRequire(`${dist}extension/package.json`);
  const init = require('@strict-ts/language-service');
  expect(typeof init).toBe('function');
  expect(require.resolve('@strict-ts/language-service')).toBe(`${dist}extension/node_modules/@strict-ts/language-service/dist/index.cjs`);
});

test('the VSIX is a zip that holds the extension and its two manifests', () => {
  const archive = readFileSync(`${dist}strict-ts.vsix`);
  expect(archive.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  // The directory at the end of a zip names every file once more.
  const end = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(archive.readUInt16LE(end + 10)).toBe(6);
  for (const name of ['[Content_Types].xml', 'extension.vsixmanifest', 'extension/package.json', 'extension/node_modules/@strict-ts/language-service/dist/index.cjs']) {
    expect(archive.includes(name), name).toBe(true);
  }
});
