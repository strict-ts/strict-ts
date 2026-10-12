// unsafe/: the file system and the compiler. Everything that may throw or return `any` leaves here as a Result.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { TypeProvider } from '@strict-ts/core';
import { checkedFileNames, createTypeScript6Provider, UNREAD_EXTENSIONS } from '@strict-ts/core/typescript6';
import { attempt, err, ok, Option, type Result, textOf } from '@strict-ts/std';
import ts from '@typescript/typescript6';
import { type Facts, fileKeys } from '../cache.js';
import { packageNameOf } from './package.js';
import { VERSION } from '../version.js';

export interface Project {
  /** The directory of tsconfig.json: the root that paths in diagnostics and in the configuration start from. */
  readonly rootDir: string;
  /** The names of the files the rules read, relative to the root. */
  readonly files: readonly string[];
  /** The program as the rules read it; `only` restricts it to some of those files. */
  readonly provider: (only?: ReadonlySet<string>) => TypeProvider;
  /** What decides the result of a run, for the cache. `settings` is what the run was configured with. */
  readonly facts: (settings: string) => Facts;
}

const describe = textOf;
const flatten = (diagnostic: ts.Diagnostic): string => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');


/** Loads the program a tsconfig.json describes. `project` is that file or its directory, relative to `cwd`. */
export function loadProject(cwd: string, project: string | undefined): Result<Project, string> {
  const loaded = attempt((): Result<Project, string> => {
    const target = resolve(cwd, project ?? '.');
    if (!existsSync(target)) return err(`${target} does not exist`);
    const tsconfig = statSync(target).isDirectory() ? join(target, 'tsconfig.json') : target;
    if (!existsSync(tsconfig)) return err(`${tsconfig} does not exist`);

    // Declared here, inside what `attempt` catches: hashing is code of Node, whose types do not say whether it throws.
    const hash = (text: string): string => createHash('sha1').update(text).digest('hex');
    const fatal: string[] = [];
    const host = { ...ts.sys, onUnRecoverableConfigFileDiagnostic: (d: ts.Diagnostic) => fatal.push(flatten(d)) };
    const parsed = ts.getParsedCommandLineOfConfigFile(tsconfig, undefined, host);
    const errors = [...fatal, ...(parsed?.errors ?? []).map(flatten)];
    if (parsed === undefined || errors.length > 0) return err(`${tsconfig}: ${errors.join('\n') || 'unreadable'}`);

    const program = ts.createProgram({
      rootNames: parsed.fileNames,
      options: parsed.options,
      ...(parsed.projectReferences === undefined ? {} : { projectReferences: parsed.projectReferences }),
    });
    const rootDir = dirname(tsconfig).replaceAll('\\', '/');
    const relative = (fileName: string): string => (fileName.startsWith(`${rootDir}/`) ? fileName.slice(rootDir.length + 1) : fileName);
    const checked = new Set(checkedFileNames(program, rootDir));
    // The sources the compiler does not read (single-file components), by absolute path: those the project's own
    // `include`, `exclude` and `files` would take if the compiler read them. A file the configuration leaves out is
    // not the project's, whatever it holds. The configuration is read again, with their extensions added.
    const extra = UNREAD_EXTENSIONS.map((extension) => ({ extension, isMixedContent: true, scriptKind: ts.ScriptKind.Deferred }));
    const widened = ts.getParsedCommandLineOfConfigFile(tsconfig, undefined, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined }, undefined, undefined, extra);
    const unreadSources = (widened?.fileNames ?? []).filter(
      (fileName) => UNREAD_EXTENSIONS.some((extension) => fileName.endsWith(extension)) && !fileName.includes('/node_modules/'),
    );

    const facts = (settings: string): Facts => {
      // A file that declares globals, or adds to a module from outside, can change the types of any other file:
      // it counts with the environment, so that a change to it spares nothing.
      const declaresGlobals = (sourceFile: ts.SourceFile): boolean =>
        !ts.isExternalModule(sourceFile) || /\bdeclare\s+(?:global\b|module\s+['"])/.test(sourceFile.text);
      const resolutions = ts.createModuleResolutionCache(rootDir, (fileName) => fileName, parsed.options);
      const outside = program
        .getSourceFiles()
        .filter((sourceFile) => !checked.has(sourceFile.fileName) || declaresGlobals(sourceFile))
        .map((sourceFile) => `${sourceFile.fileName}:${hash(sourceFile.text)}`)
        .toSorted();
      const files = Object.fromEntries(
        program
          .getSourceFiles()
          .filter((sourceFile) => checked.has(sourceFile.fileName))
          .map((sourceFile) => {
            const imports = ts
              .preProcessFile(sourceFile.text, true, true)
              .importedFiles.map((imported) => ts.resolveModuleName(imported.fileName, sourceFile.fileName, parsed.options, ts.sys, resolutions).resolvedModule?.resolvedFileName)
              .flatMap((resolved) => (resolved !== undefined && checked.has(resolved) ? [relative(resolved)] : []));
            return [relative(sourceFile.fileName), { hash: hash(sourceFile.text), imports }];
          }),
      );
      const environment = hash(JSON.stringify([VERSION, ts.version, parsed.options, settings, outside]));
      return { environment, keys: fileKeys(files, hash) };
    };

    return ok({
      rootDir,
      files: [...checked].map(relative),
      provider: (only) => {
        const names = (fileName: string): string | undefined => packageNameOf((path) => ts.sys.readFile(path), fileName).unwrapOr(undefined);
        const asked = only === undefined ? {} : { only: (fileName: string) => only.has(relative(fileName)) };
        return createTypeScript6Provider(ts, program, { rootDir, packageNameOf: names, unreadSources, ...asked });
      },
      facts,
    });
  }, describe);
  return loaded.andThen((result) => result);
}

/** Reads a JSON file that may be absent: none when there is no file, an error when it is not JSON. */
export function readJsonFile(directory: string, name: string): Result<Option<unknown>, string> {
  const path = `${directory}/${name}`;
  return attempt(
    (): Option<unknown> => (existsSync(path) ? Option.some<unknown>(JSON.parse(readFileSync(path, 'utf8'))) : Option.none),
    (cause) => `${path}: ${describe(cause)}`,
  );
}

/** Writes a text file, creating its directory. `name` is relative to `directory`. Returns the path written. */
export function writeTextFile(directory: string, name: string, text: string): Result<string, string> {
  return attempt(
    (): string => {
      const path = resolve(directory, name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
      return path;
    },
    (cause) => `${directory}/${name}: ${describe(cause)}`,
  );
}
