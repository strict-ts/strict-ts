// The non-regression corpus: runs the gate on a fixed set of projects and compares what it refuses, per rule, with
// what was recorded. Any difference fails: a rule that starts refusing more, or less, must be explained by updating
// corpus/expected.json in the same pull request.
//
//   node corpus/run.mjs                 the local projects (what the CI runs)
//   node corpus/run.mjs --external      also the open source projects, cloned at a pinned commit (needs the network)
//   node corpus/run.mjs --update        record what is found instead of comparing
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { run } from '../packages/cli/dist/index.js';

const repo = fileURLToPath(new URL('../', import.meta.url));
const args = new Set(process.argv.slice(2));
const { local, external } = JSON.parse(readFileSync(`${repo}corpus/corpus.json`, 'utf8'));
const expectedPath = `${repo}corpus/expected.json`;
const expected = existsSync(expectedPath) ? JSON.parse(readFileSync(expectedPath, 'utf8')) : {};

/** The compiler options every external project is checked with: those the rules require. */
const strict = {
  target: 'ES2022',
  module: 'ESNext',
  moduleResolution: 'Bundler',
  lib: ['ES2022', 'DOM'],
  types: [],
  noEmit: true,
  skipLibCheck: true,
  strict: true,
  noUncheckedIndexedAccess: true,
  exactOptionalPropertyTypes: true,
  noImplicitReturns: true,
  noFallthroughCasesInSwitch: true,
  noImplicitOverride: true,
};

/** Clones a project at its pinned commit, once, and gives it the tsconfig.json it is checked with. */
function fetch(project) {
  const directory = `${repo}corpus/.cache/${project.name.replaceAll(/[^\w.-]/g, '_')}`;
  if (!existsSync(`${directory}/.git`)) {
    mkdirSync(directory, { recursive: true });
    const git = (...argv) => execFileSync('git', ['-C', directory, ...argv], { stdio: 'pipe' });
    git('init', '-q');
    git('remote', 'add', 'origin', project.git);
    git('fetch', '-q', '--depth', '1', 'origin', project.commit);
    git('checkout', '-q', 'FETCH_HEAD');
  }
  const tsconfig = { compilerOptions: strict, include: project.include, exclude: project.exclude ?? [] };
  writeFileSync(`${directory}/tsconfig.json`, `${JSON.stringify(tsconfig, undefined, 2)}\n`);
  // Checked with the default configuration, whatever the project ships.
  writeFileSync(`${directory}/strict-ts.json`, '{}\n');
  return directory;
}

/** What the gate refuses in a project: a count per rule, the compiler's errors under their code. */
function measure(directory) {
  const out = [];
  const err = [];
  const code = run(['--format', 'json', '--no-baseline'], { cwd: directory, out: (line) => out.push(line), err: (line) => err.push(line) });
  if (code === 2) throw new Error(`${directory} could not be checked: ${err.join(' ')}`);
  const counts = {};
  for (const { rule } of JSON.parse(out.join('\n')).diagnostics) counts[rule] = (counts[rule] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).toSorted(([a], [b]) => (a < b ? -1 : 1)));
}

const projects = [
  ...local.map((project) => ({ name: project.name, directory: `${repo}${project.path}` })),
  ...(args.has('--external') ? external.map((project) => ({ name: project.name, directory: fetch(project) })) : []),
];

const found = {};
const differences = [];
for (const { name, directory } of projects) {
  const started = performance.now();
  found[name] = measure(directory);
  const total = Object.values(found[name]).reduce((sum, count) => sum + count, 0);
  console.log(`${name}: ${total} refused in ${Math.round(performance.now() - started)} ms`);
  const before = expected[name] ?? {};
  for (const rule of new Set([...Object.keys(before), ...Object.keys(found[name])])) {
    const was = before[rule] ?? 0;
    const is = found[name][rule] ?? 0;
    if (was !== is) differences.push(`  ${name} ${rule}: ${was} recorded, ${is} found`);
  }
}

if (args.has('--update')) {
  // Projects that were not run this time keep what was recorded for them.
  const merged = Object.fromEntries(Object.entries({ ...expected, ...found }).toSorted(([a], [b]) => (a < b ? -1 : 1)));
  writeFileSync(expectedPath, `${JSON.stringify(merged, undefined, 2)}\n`);
  console.log(`corpus/expected.json written (${differences.length} changed)`);
} else if (differences.length > 0) {
  console.error(`\nThe corpus changed:\n${differences.join('\n')}`);
  console.error('\nIf the change is meant, record it with `pnpm corpus --update` and say why in the pull request.');
  process.exitCode = 1;
} else {
  console.log('corpus: as recorded');
}
