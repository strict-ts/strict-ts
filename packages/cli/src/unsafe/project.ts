// unsafe/: the file system and the compiler. Everything that may throw or return `any` leaves here as a Result.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { TypeProvider } from '@strict-ts/core';
import { createTypeScript6Provider } from '@strict-ts/core/typescript6';
import { attempt, err, ok, Option, type Result } from '@strict-ts/std';
import ts from '@typescript/typescript6';

export interface Project {
  /** The directory of tsconfig.json: the root that paths in diagnostics and in the configuration start from. */
  readonly rootDir: string;
  readonly provider: TypeProvider;
}

const describe = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));
const flatten = (diagnostic: ts.Diagnostic): string => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');

/** Loads the program a tsconfig.json describes. `project` is that file or its directory, relative to `cwd`. */
export function loadProject(cwd: string, project: string | undefined): Result<Project, string> {
  const loaded = attempt((): Result<Project, string> => {
    const target = resolve(cwd, project ?? '.');
    if (!existsSync(target)) return err(`${target} does not exist`);
    const tsconfig = statSync(target).isDirectory() ? join(target, 'tsconfig.json') : target;
    if (!existsSync(tsconfig)) return err(`${tsconfig} does not exist`);

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
    const rootDir = dirname(tsconfig);
    return ok({ rootDir, provider: createTypeScript6Provider(ts, program, { rootDir }) });
  }, describe);
  return loaded.andThen((result) => result);
}

/** Reads a JSON file that may be absent: none when there is no file, an error when it is not JSON. */
export function readJsonFile(directory: string, name: string): Result<Option<unknown>, string> {
  const path = join(directory, name);
  return attempt(
    (): Option<unknown> => (existsSync(path) ? Option.some<unknown>(JSON.parse(readFileSync(path, 'utf8'))) : Option.none),
    (cause) => `${path}: ${describe(cause)}`,
  );
}
