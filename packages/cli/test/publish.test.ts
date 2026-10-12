// The packages published for the projects that try strict-ts: what their manifests and their versions are.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { manifestOf, PACKAGES, releaseOf, versionOf } from '../../../scripts/publish-pilot.mjs';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const own = (name: string) => JSON.parse(readFileSync(`${repo}packages/${name}/package.json`, 'utf8'));

describe('a pilot version', () => {
  test('is named after the time and the commit, and sorts in the order of the commits', () => {
    expect(versionOf('20261012093000', 'bcbd09c1f00d')).toBe('0.0.0-pilot.20261012093000.gbcbd09c');
    // A commit whose name is all digits and starts with a zero would not be a version without the prefix.
    expect(versionOf('20261012093000', '0123456789')).toMatch(/^\d+\.\d+\.\d+-pilot\.\d+\.g0123456$/);
    expect(['0.0.0-pilot.20261012093000.gffffff0', '0.0.0-pilot.20261012100000.g0000001'].toSorted()).toEqual(['0.0.0-pilot.20261012093000.gffffff0', '0.0.0-pilot.20261012100000.g0000001']);
  });

  test('the command line depends on its siblings at its own version, and keeps what it asks of the compiler', () => {
    const manifest = manifestOf(own('cli'), '0.0.0-pilot.1.gabcdef0');
    expect(manifest.version).toBe('0.0.0-pilot.1.gabcdef0');
    expect(manifest.dependencies['@strict-ts/core']).toBe('0.0.0-pilot.1.gabcdef0');
    expect(manifest.dependencies['@strict-ts/std']).toBe('0.0.0-pilot.1.gabcdef0');
    expect(manifest.dependencies['@typescript/typescript6']).toBe(own('cli').dependencies['@typescript/typescript6']);
    expect(manifest.bin).toEqual(own('cli').bin);
    expect(manifest.scripts).toBeUndefined();
    expect(manifest.devDependencies).toBeUndefined();
  });

  test('nothing published still points inside the workspace', () => {
    for (const name of PACKAGES) expect(JSON.stringify(manifestOf(own(name), '0.0.0-pilot.1.gabcdef0')), name).not.toContain('workspace:');
  });

  test('a release is asked with three numbers and nothing else', () => {
    expect(releaseOf('1.0.0')).toBe('1.0.0');
    expect(releaseOf('12.3.40')).toBe('12.3.40');
    for (const wrong of ['v1.0.0', '1.0', '1.0.0-rc.1', '01.0.0', '', undefined]) expect(releaseOf(wrong), String(wrong)).toBeUndefined();
  });

  test('a release is published under its own version, the fixer with it', () => {
    const out = execFileSync('node', ['scripts/publish-pilot.mjs', '--dry-run', '--release', '1.0.0'], { cwd: repo, encoding: 'utf8', env: { ...process.env, NPM_TOKEN: '', STRICT_TS_REGISTRY: 'http://127.0.0.1:9/' } });
    expect(out.trim().split('\n')).toEqual(['@strict-ts/std@1.0.0: would be published', '@strict-ts/core@1.0.0: would be published', '@strict-ts/cli@1.0.0: would be published', '@strict-ts/codemod@1.0.0: would be published']);
  });

  test('a dry run says what would be published and needs no token', () => {
    const out = execFileSync('node', ['scripts/publish-pilot.mjs', '--dry-run'], { cwd: repo, encoding: 'utf8', env: { ...process.env, NPM_TOKEN: '', STRICT_TS_REGISTRY: 'http://127.0.0.1:9/' } });
    expect(out.trim().split('\n')).toHaveLength(PACKAGES.length);
    expect(out).toMatch(/@strict-ts\/cli@0\.0\.0-pilot\.\d{14}\.g[0-9a-f]{7}: would be published/);
  });
});
