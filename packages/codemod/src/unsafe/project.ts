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
export const FIXABLE = ['readonly-types', 'no-type-predicate', 'no-param-mutation'] as const;

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

/** How many times the gate is asked what is written without a word: one for each step up a chain of calls. */
const MUT_PASSES = 12;
/** The methods that give back something their receiver holds. */
const PARTS: readonly string[] = ['find', 'findLast', 'at', 'get', 'pop', 'shift'];
const STD = '@strict-ts/std';

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

    /**
     * `Mut<…>` where the gate says something is changed without a word: `this: Mut<Name>` on a method that writes
     * its object, `Mut<…>` around the type of a parameter that is written, and around the return type of a function
     * whose result is written. Not a fix like the others: the word removes a refusal where it is written and makes
     * one at each caller that holds the value without saying it may change it, so it cannot be judged one place at
     * a time. The gate is asked what is written, the word is put everywhere it asks, and it is asked again: a
     * method that calls one that writes now writes too. When nothing more is found, the whole is kept if the
     * project compiles and is refused in fewer places than before; or none of it is.
     */
    const sayWhatChanges = (): { readonly applied: readonly Place[]; readonly left: readonly Place[] } => {
      const start = new Map(changed);
      const applied: Mut<Place[]> = [];
      const left: Mut<Place[]> = [];
      const saysMut = (node: ts.Node): boolean =>
        (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) && node.typeName.text === 'Mut') || (ts.forEachChild(node, saysMut) ?? false);
      let program = compile();
      const refusedAtStart = refusals(program).length;
      for (let pass = 0; pass < MUT_PASSES; pass++) {
        const checker = program.getTypeChecker();
        const inserts = new Map<string, Mut<{ at: number; text: string }[]>>();
        const seen = new Set<ts.Node>();
        const insert = (file: ts.SourceFile, at: number, text: string): void => {
          const here = inserts.get(file.fileName) ?? [];
          inserts.set(file.fileName, here);
          here.push({ at, text });
        };
        /** `Mut<…>` around a written type; inside `Promise<…>`, around what it promises. */
        const wrap = (type: ts.TypeNode): boolean => {
          const promised = ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName) && type.typeName.text === 'Promise' ? type.typeArguments?.[0] : undefined;
          const inner = promised ?? type;
          const file = inner.getSourceFile();
          if (seen.has(inner) || saysMut(type) || !texts.has(file.fileName)) return false;
          seen.add(inner);
          insert(file, inner.getStart(file), 'Mut<');
          insert(file, inner.getEnd(), '>');
          return true;
        };
        for (const refusal of refusals(program)) {
          if (refusal.rule !== 'no-param-mutation' && refusal.rule !== 'mut-from-readonly') continue;
          const file = program.getSourceFile(`${rootDir}/${refusal.file}`);
          if (file === undefined || !texts.has(file.fileName)) continue;
          const at = ts.getPositionOfLineAndCharacter(file, refusal.start.line - 1, refusal.start.column - 1);
          const inner = (node: ts.Node): ts.Node => ts.forEachChild(node, (child) => (at >= child.getStart(file) && at < child.getEnd() ? inner(child) : undefined)) ?? node;
          const place = inner(file);
          const where: Place = { rule: 'no-param-mutation', file: refusal.file, line: refusal.start.line, column: refusal.start.column };
          const named = /^(?:Parameter )?`([^`]+)`/.exec(refusal.message)?.[1] ?? '';
          const done = (fixed: boolean): void => {
            if (fixed) applied.push(where);
            else if (pass === 0) left.push(where);
          };

          if (refusal.message.startsWith('`this` is mutated')) {
            // The function whose `this` it is: an arrow has the `this` of where it is written.
            let owner: ts.Node | undefined = place;
            while (owner !== undefined && !(ts.isFunctionLike(owner) && !ts.isArrowFunction(owner))) owner = owner.parent;
            if (owner === undefined || seen.has(owner)) continue;
            seen.add(owner);
            const holder = owner.parent;
            // A getter and a function kept in a property cannot declare `this`; an object written in place has no name.
            if (!ts.isMethodDeclaration(owner) || !ts.isClassLike(holder) || holder.name === undefined) {
              done(false);
              continue;
            }
            const generics = (holder.typeParameters ?? []).map((parameter) => parameter.name.text);
            const self = `${holder.name.text}${generics.length === 0 ? '' : `<${generics.join(', ')}>`}`;
            insert(file, owner.parameters.pos, `this: Mut<${self}>${owner.parameters.length === 0 ? '' : ', '}`);
            done(true);
          } else if (refusal.message.startsWith('Parameter `')) {
            // The nearest function that has a parameter of that name.
            let parameter: ts.ParameterDeclaration | undefined;
            for (let owner: ts.Node | undefined = place; owner !== undefined && parameter === undefined; owner = owner.parent) {
              if (ts.isFunctionLike(owner)) parameter = owner.parameters.find((one) => ts.isIdentifier(one.name) && one.name.text === named);
            }
            // A parameter with no written type takes it from where the function is given: nothing to write here.
            if (parameter === undefined || seen.has(parameter)) continue;
            seen.add(parameter);
            done(parameter.type !== undefined && parameter.dotDotDotToken === undefined && wrap(parameter.type));
          } else if (refusal.message.includes('that gave it does not say')) {
            // The name that is written, in the statement the refusal is in; then the call it was made from.
            let statement: ts.Node = place;
            while (!ts.isStatement(statement) && !ts.isSourceFile(statement.parent)) statement = statement.parent;
            const find = (node: ts.Node): ts.Identifier | undefined => (ts.isIdentifier(node) && node.text === named ? node : ts.forEachChild(node, find));
            const name = find(statement);
            let declaration: ts.Node | undefined = name === undefined ? undefined : checker.getSymbolAtLocation(name)?.valueDeclaration;
            while (declaration !== undefined && (ts.isBindingElement(declaration) || ts.isObjectBindingPattern(declaration) || ts.isArrayBindingPattern(declaration))) declaration = declaration.parent;
            if (declaration === undefined || !ts.isVariableDeclaration(declaration)) continue;
            const loop = declaration.parent.parent;
            let source: ts.Expression | undefined = ts.isForOfStatement(loop) ? loop.expression : declaration.initializer;
            // `store.living().find(…)`: what `find` gives is a part of what `living` gave.
            for (;;) {
              if (source === undefined) break;
              if (ts.isParenthesizedExpression(source) || ts.isNonNullExpression(source) || ts.isAwaitExpression(source)) source = source.expression;
              else if (ts.isCallExpression(source) && ts.isPropertyAccessExpression(source.expression) && ts.isCallExpression(source.expression.expression) && PARTS.includes(source.expression.name.text)) source = source.expression.expression;
              else break;
            }
            const giver = source !== undefined && ts.isCallExpression(source) ? checker.getResolvedSignature(source)?.getDeclaration() : undefined;
            if (giver === undefined || seen.has(giver)) continue;
            seen.add(giver);
            done(giver.type !== undefined && wrap(giver.type));
          }
        }
        if (inserts.size === 0) break;
        for (const [fileName, here] of inserts) {
          const file = program.getSourceFile(fileName);
          if (file === undefined) continue;
          const imports = file.statements.filter(ts.isImportDeclaration);
          const imported = imports.some((declaration) => {
            const bindings = declaration.importClause?.namedBindings;
            return bindings !== undefined && ts.isNamedImports(bindings) && bindings.elements.some((element) => element.name.text === 'Mut');
          });
          // After the imports there are; or after the directives a file starts with (`"use client"`).
          const directives = file.statements.filter((statement, index) => ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression) && file.statements.slice(0, index).every(ts.isExpressionStatement));
          const after = imports.at(-1)?.getEnd() ?? directives.at(-1)?.getEnd();
          if (!imported) here.push(after === undefined ? { at: 0, text: `import type { Mut } from '${STD}';\n` } : { at: after, text: `\nimport type { Mut } from '${STD}';` });
          let text = file.text;
          // From the end of the file to its start, so that no place moves before it is written; at one place, in the order asked.
          for (const one of here.map((entry, index) => ({ ...entry, index })).toSorted((a, b) => b.at - a.at || b.index - a.index)) text = `${text.slice(0, one.at)}${one.text}${text.slice(one.at)}`;
          changed.set(fileName, text);
        }
        program = compile();
      }
      const holds = ts.getPreEmitDiagnostics(program).length <= before && refusals(program).length < refusedAtStart;
      if (holds || applied.length === 0) return { applied, left };
      changed.clear();
      for (const [fileName, text] of start) changed.set(fileName, text);
      return { applied: [], left: [...applied, ...left] };
    };
    const receivers = rules.includes('no-param-mutation') ? sayWhatChanges() : { applied: [], left: [] };

    const place = (fix: Fix): Place => {
      const { line, character } = ts.getLineAndCharacterOfPosition(original.getSourceFile(fix.file) ?? sources[0] ?? ts.createSourceFile('', '', 99), fix.at);
      return { rule: fix.rule, file: relative(fix.file), line: line + 1, column: character + 1 };
    };
    if (!dryRun) for (const [fileName, text] of changed) writeFileSync(fileName, text);
    return ok({
      applied: [...kept.map(place), ...receivers.applied],
      left: [...found.filter((fix) => !kept.includes(fix)).map(place), ...receivers.left],
      written: dryRun ? [] : [...changed.keys()].map(relative).toSorted(),
    });
  }, describe);
  return outcome.andThen((result) => result);
}
