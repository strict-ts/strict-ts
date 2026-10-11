// Builds a TypeScript 6 program from files held in memory and runs the rules on it, as the CLI will from disk.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from '@typescript/typescript6';
import { check, type Config, defaultConfig, type Diagnostic } from '../src/index.js';
import { createTypeScript6Provider } from '../src/typescript6/provider.js';

const ROOT = '/strict-ts-fixture';
const ENV = '/strict-ts-environment/env.d.ts';
const std = fileURLToPath(new URL('../../std/src/index.ts', import.meta.url));
const fixtures = new URL('fixtures/', import.meta.url);
const env = readFileSync(new URL('env.d.ts', fixtures), 'utf8');

export const strictOptions = {
  strict: true,
  noUncheckedIndexedAccess: true,
  exactOptionalPropertyTypes: true,
  noImplicitReturns: true,
  noFallthroughCasesInSwitch: true,
  noImplicitOverride: true,
  noPropertyAccessFromIndexSignature: true,
};

export interface Project {
  readonly config?: Config;
  readonly compilerOptions?: ts.CompilerOptions;
}

// The standard library's declarations are the same in every program: parsed once.
const parsed = new Map<string, ts.SourceFile | undefined>();

export function checkFiles(files: Readonly<Record<string, string>>, project: Project = {}): readonly Diagnostic[] {
  // The ambient globals sit outside the project, as the types of a dependency would: inside it, a declaration file
  // is itself refused.
  const virtual = new Map([
    [ENV, env],
    ...Object.entries(files).map(([name, text]) => [`${ROOT}/${name}`, text] as const),
  ]);
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ['lib.es2022.d.ts'],
    types: [],
    noEmit: true,
    paths: { '@strict-ts/std': [std] },
    ...strictOptions,
    ...project.compilerOptions,
  };
  const disk = ts.createCompilerHost(options);
  const host: ts.CompilerHost = {
    ...disk,
    getCurrentDirectory: () => ROOT,
    fileExists: (fileName) => virtual.has(fileName) || disk.fileExists(fileName),
    readFile: (fileName) => virtual.get(fileName) ?? disk.readFile(fileName),
    directoryExists: (directory) =>
      [...virtual.keys()].some((fileName) => fileName.startsWith(`${directory}/`)) ||
      (disk.directoryExists?.(directory) ?? false),
    getSourceFile: (fileName, languageVersion) => {
      const text = virtual.get(fileName);
      if (text !== undefined) return ts.createSourceFile(fileName, text, languageVersion, true);
      if (!parsed.has(fileName)) parsed.set(fileName, disk.getSourceFile(fileName, languageVersion));
      return parsed.get(fileName);
    },
  };
  const program = ts.createProgram({ rootNames: [...virtual.keys()], options, host });
  return check(createTypeScript6Provider(ts, program, { rootDir: ROOT }), project.config ?? defaultConfig);
}

/** Checks one safe file, `src/a.ts`. */
export const checkSafe = (text: string, project?: Project): readonly Diagnostic[] =>
  checkFiles({ 'src/a.ts': text }, project);

/** Checks one file of the unsafe directory, `src/unsafe/a.ts`. */
export const checkUnsafe = (text: string, project?: Project): readonly Diagnostic[] =>
  checkFiles({ 'src/unsafe/a.ts': text }, project);

/** `rule@line` for each diagnostic, in order: enough to say what is refused and where. */
export const refusals = (found: readonly Diagnostic[]): readonly string[] =>
  found.map((diagnostic) => `${diagnostic.rule}@${diagnostic.start.line}`);

/** Reads a directory of test/fixtures (or any directory) as a project. */
export function readProject(directory: URL): Readonly<Record<string, string>> {
  const names = readdirSync(directory, { recursive: true, encoding: 'utf8' }).filter((name) => name.endsWith('.ts'));
  return Object.fromEntries(
    names.map((name) => [name.replaceAll('\\', '/'), readFileSync(new URL(name, directory), 'utf8')]),
  );
}

export const fixture = (name: string): Readonly<Record<string, string>> => readProject(new URL(`${name}/`, fixtures));
