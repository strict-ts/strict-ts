// unsafe/: the file system and the compiler. Everything that may throw leaves here as a Result.
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { CONFIG_FILE, readSettings } from '@strict-ts/cli/settings';
import { type Config, isUnsafe } from '@strict-ts/core';
import { attempt, err, type Mut, none, ok, type Option, type Result, some, textOf } from '@strict-ts/std';
import ts from '@typescript/typescript6';
import { applyEdits, type Fix, keepWhatHolds } from '../fix.js';
import { readonlyFixes } from '../fixes/readonly-types.js';
import { typePredicateFixes } from '../fixes/type-predicate.js';

/** The rules this package can fix. */
export const FIXABLE = ['readonly-types', 'no-type-predicate'] as const;

export interface Outcome {
  /** The fixes kept, with the file they are in (relative to the project) and their place there. */
  readonly applied: readonly Place[];
  /** The fixes dropped because the project no longer compiled with them. */
  readonly left: readonly Place[];
  /** The files rewritten, relative to the project. Empty in a dry run. */
  readonly written: readonly string[];
}

export interface Place {
  readonly rule: string;
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

const describe = textOf;
const flatten = (diagnostic: ts.Diagnostic): string => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');

function readJson(path: string): Result<Option<unknown>, string> {
  return attempt(
    (): Option<unknown> => (existsSync(path) ? some<unknown>(JSON.parse(ts.sys.readFile(path) ?? 'null')) : none),
    (cause) => `${path}: ${describe(cause)}`,
  );
}

/**
 * Finds the fixes of `rules` in the safe files of a project and keeps those under which the compiler reports no
 * more errors than before. Writes the files unless `dryRun`.
 */
export function fixProject(cwd: string, project: string | undefined, rules: readonly string[], dryRun: boolean): Result<Outcome, string> {
  const outcome = attempt((): Result<Outcome, string> => {
    const target = resolve(cwd, project ?? '.');
    if (!existsSync(target)) return err(`${target} does not exist`);
    const tsconfig = statSync(target).isDirectory() ? join(target, 'tsconfig.json') : target;
    if (!existsSync(tsconfig)) return err(`${tsconfig} does not exist`);
    const rootDir = dirname(tsconfig).replaceAll('\\', '/');
    const settings = readJson(join(rootDir, CONFIG_FILE)).andThen(readSettings);
    if (!settings.ok) return err(settings.error);
    const config: Config = settings.value.config;

    const fatal: Mut<string[]> = [];
    const parsed = ts.getParsedCommandLineOfConfigFile(tsconfig, undefined, {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (d) => fatal.push(flatten(d)),
    });
    const errors = [...fatal, ...(parsed?.errors ?? []).map(flatten)];
    if (parsed === undefined || errors.length > 0) return err(`${tsconfig}: ${errors.join('\n') || 'unreadable'}`);

    // The files as they would be once fixed are held in memory; the compiler reads them through this host.
    const changed = new Map<string, string>();
    const disk = ts.createCompilerHost(parsed.options);
    const host: ts.CompilerHost = {
      ...disk,
      readFile: (fileName) => changed.get(fileName) ?? disk.readFile(fileName),
      getSourceFile: (fileName, languageVersion, onError, shouldCreate) => {
        const text = changed.get(fileName);
        return text === undefined
          ? disk.getSourceFile(fileName, languageVersion, onError, shouldCreate)
          : ts.createSourceFile(fileName, text, languageVersion, true);
      },
    };
    const compile = (): ts.Program =>
      ts.createProgram({
        rootNames: parsed.fileNames,
        options: parsed.options,
        host,
        ...(parsed.projectReferences === undefined ? {} : { projectReferences: parsed.projectReferences }),
      });
    const original = compile();
    const before = ts.getPreEmitDiagnostics(original).length;

    const relative = (fileName: string): string => (fileName.startsWith(`${rootDir}/`) ? fileName.slice(rootDir.length + 1) : fileName);
    const sources = original
      .getSourceFiles()
      .filter(
        (sourceFile) =>
          !sourceFile.isDeclarationFile &&
          !original.isSourceFileFromExternalLibrary(sourceFile) &&
          !sourceFile.fileName.includes('/node_modules/') &&
          sourceFile.fileName.startsWith(`${rootDir}/`) &&
          !isUnsafe(relative(sourceFile.fileName), config),
      );
    const texts = new Map(sources.map((sourceFile) => [sourceFile.fileName, sourceFile.text]));
    const found = sources.flatMap((sourceFile) => [
      ...(rules.includes('readonly-types') ? readonlyFixes(ts, sourceFile, sourceFile.fileName) : []),
      ...(rules.includes('no-type-predicate') ? typePredicateFixes(ts, sourceFile, sourceFile.fileName) : []),
    ]);

    const rewrite = (kept: readonly Fix[]): void => {
      changed.clear();
      for (const [fileName, text] of texts) {
        const here = kept.filter((fix) => fix.file === fileName);
        if (here.length > 0) changed.set(fileName, applyEdits(text, here));
      }
    };
    const kept = keepWhatHolds(found, (candidates) => {
      rewrite(candidates);
      return ts.getPreEmitDiagnostics(compile()).length <= before;
    });
    rewrite(kept);

    const place = (fix: Fix): Place => {
      const { line, character } = ts.getLineAndCharacterOfPosition(original.getSourceFile(fix.file) ?? sources[0] ?? ts.createSourceFile('', '', 99), fix.at);
      return { rule: fix.rule, file: relative(fix.file), line: line + 1, column: character + 1 };
    };
    if (!dryRun) for (const [fileName, text] of changed) writeFileSync(fileName, text);
    return ok({
      applied: kept.map(place),
      left: found.filter((fix) => !kept.includes(fix)).map(place),
      written: dryRun ? [] : [...changed.keys()].map(relative).toSorted(),
    });
  }, describe);
  return outcome.andThen((result) => result);
}
