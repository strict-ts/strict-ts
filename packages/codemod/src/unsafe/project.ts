// unsafe/: the file system and the compiler. Everything that may throw leaves here as a Result.
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { CONFIG_FILE, readSettings } from '@strict-ts/cli/settings';
import { check, type Config, isUnsafe } from '@strict-ts/core';
import { createTypeScript6Provider } from '@strict-ts/core/typescript6';
import { attempt, err, type Mut, none, ok, type Option, type Result, some, textOf } from '@strict-ts/std';
import ts from '@typescript/typescript6';
import { blamedFixes } from '../blame.js';
import { applyEdits, type Fix, keepUnblamed, type Placed, placesAfter, type Trial } from '../fix.js';
import { readonlyFixes } from '../fixes/readonly-types.js';
import { typePredicateFixes } from '../fixes/type-predicate.js';

/** The rules this package can fix. */
export const FIXABLE = ['readonly-types', 'no-type-predicate'] as const;

export interface Outcome {
  /** The fixes kept, with the file they are in (relative to the project) and their place there. */
  readonly applied: readonly Place[];
  /** The fixes dropped because the project no longer compiled with them, or was refused for something new. */
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
 * more errors than before, and the gate refuses nothing it did not refuse. Writes the files unless `dryRun`.
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
    // A file that no fix touches is parsed once: the libraries are most of a compilation.
    const untouched = new Map<string, ts.SourceFile | undefined>();
    const host: ts.CompilerHost = {
      ...disk,
      readFile: (fileName) => changed.get(fileName) ?? disk.readFile(fileName),
      getSourceFile: (fileName, languageVersion, onError, shouldCreate) => {
        const text = changed.get(fileName);
        if (text !== undefined) return ts.createSourceFile(fileName, text, languageVersion, true);
        if (!untouched.has(fileName)) untouched.set(fileName, disk.getSourceFile(fileName, languageVersion, onError, shouldCreate));
        return untouched.get(fileName);
      },
    };
    // The program before gives the next one what does not change with a fix: which files there are, and where
    // each import leads.
    let last: ts.Program | undefined;
    const compile = (): ts.Program => {
      const program = ts.createProgram({
        rootNames: parsed.fileNames,
        options: parsed.options,
        host,
        ...(last === undefined ? {} : { oldProgram: last }),
        ...(parsed.projectReferences === undefined ? {} : { projectReferences: parsed.projectReferences }),
      });
      last = program;
      return program;
    };
    const original = compile();
    const said = (diagnostic: ts.Diagnostic): string => `${diagnostic.file?.fileName ?? ''} ${diagnostic.code} ${flatten(diagnostic)}`;
    const errorsBefore = ts.getPreEmitDiagnostics(original);
    const before = errorsBefore.length;
    const known = new Set(errorsBefore.map(said));

    // What the gate refuses, by place and rule. A fix must add nothing to it: one that compiles can still let an
    // `any` in (`Array.isArray` on a read-only array gives `any[]`).
    const refusals = (program: ts.Program) => check(createTypeScript6Provider(ts, program, { rootDir, compilerDiagnostics: false }), config);
    const named = (refusal: { readonly file: string; readonly start: { readonly line: number }; readonly rule: string }): string =>
      `${refusal.file}:${refusal.start.line} ${refusal.rule}`;
    const refusedBefore = new Map<string, number>();
    for (const refusal of refusals(original)) refusedBefore.set(named(refusal), (refusedBefore.get(named(refusal)) ?? 0) + 1);

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
    const kept = keepUnblamed(found, (candidates, thorough = false): Trial => {
      rewrite(candidates);
      const program = compile();
      const errors = ts.getPreEmitDiagnostics(program);
      const compiles = errors.length <= before;
      const places = new Map<string, readonly Placed[]>();
      const placedIn = (fileName: string): readonly Placed[] => {
        const placed = places.get(fileName) ?? placesAfter(candidates.filter((fix) => fix.file === fileName));
        places.set(fileName, placed);
        return placed;
      };
      const checker = program.getTypeChecker();
      // A hint that cannot be computed is no hint: the search does without it.
      const hint = (error: Parameters<typeof blamedFixes>[2]): readonly Fix[] => attempt(() => blamedFixes(ts, checker, error, placedIn), describe).unwrapOr([]);
      // Fixes add no line: the line of an error names it from one compilation to the next.
      const where = (error: ts.Diagnostic): string =>
        `${error.file?.fileName ?? ''}:${error.file === undefined ? 0 : ts.getLineAndCharacterOfPosition(error.file, error.start ?? 0).line} ${error.code}`;
      const fromCompiler = compiles ? [] : errors.filter((error) => !known.has(said(error))).map((error) => ({ where: where(error), fixes: hint(error) }));
      // The gate is the slower check: it is asked when the project compiles, or when every check is wanted.
      if (!compiles && !thorough) return { holds: false, errors: fromCompiler };
      const seen = new Map<string, number>();
      const fromGate = refusals(program).flatMap((refusal) => {
        const name = named(refusal);
        seen.set(name, (seen.get(name) ?? 0) + 1);
        if ((seen.get(name) ?? 0) <= (refusedBefore.get(name) ?? 0)) return [];
        const file = program.getSourceFile(`${rootDir}/${refusal.file}`);
        const at = (position: { readonly line: number; readonly column: number }): number =>
          file === undefined ? 0 : attempt(() => ts.getPositionOfLineAndCharacter(file, position.line - 1, position.column - 1), describe).unwrapOr(0);
        const fixes = file === undefined ? [] : hint({ file, start: at(refusal.start), length: at(refusal.end) - at(refusal.start), code: 0, messageText: refusal.message });
        return [{ where: name, fixes }];
      });
      return { holds: compiles && fromGate.length === 0, errors: [...fromCompiler, ...fromGate] };
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
