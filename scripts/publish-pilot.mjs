// Publishes the packages a project outside this repo installs (std, core, cli) on the npm registry of the Gitea,
// under a pilot version named after the commit they are built from. Run by the CI on each push to main, after
// every check passed; `pnpm build` must have run.
//
//   node scripts/publish-pilot.mjs --dry-run    says what would be published, and writes nothing to the registry
//   NPM_TOKEN=… node scripts/publish-pilot.mjs  publishes what the registry does not have yet
//
// Nothing here is a release: the version is `0.0.0-pilot.<time of the commit>.g<commit>`, and the tag is `pilot`.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACKAGES = ['std', 'core', 'cli'];
export const REGISTRY = 'https://git.cf.adserver.fr/api/packages/Alex/npm/';

/**
 * The version of a commit. The time comes first, so that versions sort in the order of the commits; the commit is
 * prefixed, since a part made of digits only must not start with a zero.
 */
export const versionOf = (time, commit) => `0.0.0-pilot.${time}.g${commit.slice(0, 7)}`;

/** The manifest that is published: the package's own, at this version, depending on its siblings at the same one. */
export function manifestOf(own, version) {
  const { scripts: _scripts, devDependencies: _dev, ...kept } = own;
  const pinned = (dependencies) =>
    dependencies === undefined ? undefined : Object.fromEntries(Object.entries(dependencies).map(([name, range]) => [name, range.startsWith('workspace:') ? version : range]));
  const dependencies = pinned(own.dependencies);
  const peerDependencies = pinned(own.peerDependencies);
  return {
    ...kept,
    version,
    ...(dependencies === undefined ? {} : { dependencies }),
    ...(peerDependencies === undefined ? {} : { peerDependencies }),
    repository: { type: 'git', url: 'https://git.cf.adserver.fr/Alex/strict-ts.git', directory: `packages/${own.name.slice('@strict-ts/'.length)}` },
  };
}

/** Whether the registry already has this version of a package. */
async function published(registry, name, version) {
  // A registry that does not answer has nothing: the publication then says why it cannot be reached.
  const response = await fetch(`${registry}${name.replace('/', '%2F')}`).catch(() => undefined);
  if (response === undefined || !response.ok) return false;
  const known = await response.json().catch(() => undefined);
  return typeof known === 'object' && known !== null && typeof known.versions === 'object' && known.versions !== null && version in known.versions;
}

async function main() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const dryRun = process.argv.includes('--dry-run');
  const registry = process.env.STRICT_TS_REGISTRY ?? REGISTRY;
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const version = versionOf(git('show', '-s', '--format=%cd', '--date=format:%Y%m%d%H%M%S', 'HEAD'), git('rev-parse', 'HEAD'));
  if (!dryRun && !process.env.NPM_TOKEN) {
    console.error('NPM_TOKEN is not set: nothing can be published.');
    process.exit(2);
  }
  for (const directory of PACKAGES) {
    const source = join(root, 'packages', directory);
    const own = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
    if (await published(registry, own.name, version)) {
      console.log(`${own.name}@${version}: already on the registry`);
      continue;
    }
    const staged = mkdtempSync(join(tmpdir(), `strict-ts-${directory}-`));
    try {
      for (const file of [...(own.files ?? ['dist']), 'README.md']) {
        if (!existsSync(join(source, file))) throw new Error(`${own.name}: ${file} is missing: run \`pnpm build\` first`);
        cpSync(join(source, file), join(staged, file), { recursive: true });
      }
      cpSync(join(root, 'LICENSE'), join(staged, 'LICENSE'));
      writeFileSync(join(staged, 'package.json'), `${JSON.stringify(manifestOf(own, version), undefined, 2)}\n`);
      // The token is named, not written: npm reads it from the environment.
      const host = registry.replace(/^https?:/, '');
      writeFileSync(join(staged, '.npmrc'), `@strict-ts:registry=${registry}\n${host}:_authToken=\${NPM_TOKEN}\n`);
      const args = ['publish', '--tag', 'pilot', ...(dryRun ? ['--dry-run'] : [])];
      execFileSync('npm', args, { cwd: staged, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, NPM_TOKEN: process.env.NPM_TOKEN ?? 'dry-run' } });
      console.log(`${own.name}@${version}: ${dryRun ? 'would be published' : 'published'}`);
    } finally {
      rmSync(staged, { recursive: true, force: true });
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
