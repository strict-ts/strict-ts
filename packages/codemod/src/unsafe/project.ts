// unsafe/: the file system and the compiler. Everything that may throw leaves here as a Result.
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { packageNameOf } from '@strict-ts/cli/package-name';
import { CONFIG_FILE, readSettings } from '@strict-ts/cli/settings';
import { check, type Config, isUnsafe } from '@strict-ts/core';
import { createTypeScript6Provider } from '@strict-ts/core/typescript6';
import { attempt, err, type Mut, none, ok, type Option, type Result, some, textOf } from '@strict-ts/std';
import { mut } from '@strict-ts/std';
import ts from '@typescript/typescript6';
import { blamedFixes } from '../blame.js';
import { applyEdits, type Fix, keepUnblamed, type Placed, placesAfter, type Trial } from '../fix.js';
import { comparer, declaredBehind, names as shapeNames } from '../crossing.js';
import { mutFixes } from '../fixes/mut-types.js';
import { nullFixes } from '../fixes/no-null.js';
import { nonNullFixes } from '../fixes/non-null.js';
import { readonlyFixes } from '../fixes/readonly-types.js';
import { typePredicateFixes } from '../fixes/type-predicate.js';

/** The rules this package can fix. */
export const FIXABLE = ['readonly-types', 'no-type-predicate', 'no-non-null', 'no-param-mutation', 'no-null'] as const;
/**
 * The fixes that are run only when their rule is named: they write names of the library, are judged as a whole, or
 * change what the program does.
 */
export const ON_REQUEST: readonly string[] = ['no-non-null', 'no-param-mutation', 'no-null'];

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
/** Which type argument of a container is what it holds. */
const HOLDERS: Readonly<Record<string, number>> = { Array: 0, ReadonlyArray: 0, Set: 0, ReadonlySet: 0, Map: 1, ReadonlyMap: 1 };
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

    const fatal: Mut<string[]> = mut([]);
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
    // As the gate does: with the name of the package each file of a dependency belongs to. Without it a call into
    // an allowed package is not known to be one, and a fix would be judged by a stricter gate than the real one.
    const names = (fileName: string): string | undefined => packageNameOf((path) => ts.sys.readFile(path), fileName).unwrapOr(undefined);
    const refusals = (program: ts.Program) => check(createTypeScript6Provider(ts, program, { rootDir, packageNameOf: names, compilerDiagnostics: false }), config);
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
      ...(rules.includes('no-non-null') ? nonNullFixes(ts, sourceFile, sourceFile.fileName) : []),
      ...(rules.includes('no-null') ? nullFixes(ts, original.getTypeChecker(), sourceFile, sourceFile.fileName) : []),
    ]);
    // A `null` that became `undefined` compiles where it is told apart from what it was: the types of the project
    // as it was are compared with those of each trial, at every place where a value is handed on.
    const compared = comparer(ts, { program: original, checker: original.getTypeChecker() }, shapeNames());
    const fileNames = sources.map((sourceFile) => sourceFile.fileName);
    const tellsApart = (program: ts.Program, candidates: readonly Fix[]) =>
      candidates.some((fix) => fix.rule === 'no-null') ? compared.compare({ program, checker: program.getTypeChecker() }, fileNames) : { crossings: [], compared: [] };

    // Where a name of the library goes in each file, and which it has: a fix that writes `Mut` or `panic` needs it.
    const importsOf = new Map(
      sources.map((sourceFile) => {
        const imports = sourceFile.statements.filter(ts.isImportDeclaration);
        const has = imports.flatMap((declaration) => {
          const bindings = declaration.importClause?.namedBindings;
          return bindings !== undefined && ts.isNamedImports(bindings) ? bindings.elements.map((element) => element.name.text) : [];
        });
        // After the imports there are; or after the directives a file starts with (`"use client"`).
        const directives = sourceFile.statements.filter((statement, index) => ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression) && sourceFile.statements.slice(0, index).every(ts.isExpressionStatement));
        const after = imports.at(-1)?.getEnd() ?? directives.at(-1)?.getEnd();
        // The line an import is written under, counted from 1; 0 at the top of the file.
        const line = after === undefined ? 0 : ts.getLineAndCharacterOfPosition(sourceFile, after).line + 1;
        return [sourceFile.fileName, { has, after, line }] as const;
      }),
    );
    /** The fixes, and one more for each file that has to import what they write. */
    const withImports = (fixes: readonly Fix[]): readonly Fix[] => {
      const added: Mut<Fix[]> = mut([]);
      for (const [fileName, { has, after }] of importsOf) {
        const names = [...new Set(fixes.flatMap((fix) => (fix.file === fileName && fix.needs !== undefined && !has.includes(fix.needs) ? [fix.needs] : [])))].toSorted();
        if (names.length === 0) continue;
        const lines = names.map((name) => (name === 'Mut' ? `import type { Mut } from '${STD}';` : `import { ${name} } from '${STD}';`));
        const at = after ?? 0;
        added.push({ rule: 'import', file: fileName, at, edits: [{ start: at, end: at, text: after === undefined ? `${lines.join('\n')}\n` : `\n${lines.join('\n')}` }] });
      }
      return [...fixes, ...added];
    };
    const rewrite = (kept: readonly Fix[]): void => {
      changed.clear();
      const all = withImports(kept);
      for (const [fileName, text] of texts) {
        const here = all.filter((fix) => fix.file === fileName);
        if (here.length > 0) changed.set(fileName, applyEdits(text, here));
      }
    };
    // A strict comparison with `null` of what became `undefined` is rewritten with the fixes it follows from: left
    // as it is, it would be a branch never taken again, and what it narrows would not compile. These edits are
    // no fixes of their own: they come and go with the fixes that are tried.
    const COMPARED = 'no-null: a comparison';
    const withComparisons = (tried: readonly Fix[]): readonly Fix[] => {
      rewrite(tried);
      if (!tried.some((fix) => fix.rule === 'no-null')) return tried;
      const rewritten = tellsApart(compile(), tried).compared.map((comparison): Fix => ({ rule: COMPARED, file: comparison.file, at: comparison.start, edits: [{ start: comparison.start, end: comparison.end, text: 'undefined' }] }));
      rewrite([...tried, ...rewritten]);
      return [...tried, ...rewritten];
    };
    const judge = (settled: readonly Fix[]) => (candidates: readonly Fix[], thorough = false): Trial => {
      const tried = withComparisons([...settled, ...candidates]);
      const nulls = candidates.some((fix) => fix.rule === 'no-null');
      // A fix adds no line, so the line of an error names it from one compilation to the next; an import does add
      // one, and what is under it is named by the line it had.
      const addedIn = new Map(withImports(tried).flatMap((fix) => (fix.rule === 'import' ? [[fix.file, (fix.edits[0]?.text.match(/import /g) ?? []).length] as const] : [])));
      const lineBefore = (fileName: string, line: number): number => {
        const added = addedIn.get(fileName) ?? 0;
        const under = importsOf.get(fileName)?.line ?? 0;
        return line > under + added ? line - added : line <= under ? line : -line;
      };
      const program = compile();
      const errors = ts.getPreEmitDiagnostics(program);
      const compiles = errors.length <= before;
      const places = new Map<string, readonly Placed[]>();
      const placedIn = (fileName: string): readonly Placed[] => {
        // Among everything written in the file, so that each place is right; only the candidates are to blame.
        const placed = places.get(fileName) ?? placesAfter(withImports(tried).filter((fix) => fix.file === fileName)).filter((one) => candidates.includes(one.fix));
        places.set(fileName, placed);
        return placed;
      };
      const checker = program.getTypeChecker();
      // A hint that cannot be computed is no hint: the search does without it.
      const read = (error: Parameters<typeof blamedFixes>[2]): readonly Fix[] => attempt(() => blamedFixes(ts, checker, error, placedIn), describe).unwrapOr([]);
      // A fix of `no-null` answers for every place that holds what it rewrote: the declarations behind the place
      // of an error, and those of the members of its types.
      const behind = (error: Parameters<typeof blamedFixes>[2]): readonly Fix[] =>
        attempt(() => {
          const from = error.start ?? 0;
          const spans = error.file === undefined ? [] : declaredBehind(ts, checker, error.file, from, from + (error.length ?? 0));
          return spans.flatMap((span) => placedIn(span.file).flatMap((placed) => (placed.fix.rule === 'no-null' && span.start <= placed.at && placed.at <= span.end ? [placed.fix] : [])));
        }, describe).unwrapOr([]);
      const hint = (error: Parameters<typeof blamedFixes>[2]): readonly Fix[] => (nulls ? [...new Set([...read(error), ...behind(error)])] : read(error));
      // Fixes add no line: the line of an error names it from one compilation to the next.
      const where = (error: ts.Diagnostic): string =>
        `${error.file?.fileName ?? ''}:${error.file === undefined ? 0 : lineBefore(error.file.fileName, ts.getLineAndCharacterOfPosition(error.file, error.start ?? 0).line + 1) - 1} ${error.code}`;
      const fromCompiler = compiles ? [] : errors.filter((error) => !known.has(said(error))).map((error) => ({ where: where(error), fixes: hint(error) }));
      // The gate is the slower check: it is asked when the project compiles, or when every check is wanted.
      if (!compiles && !thorough) return { holds: false, errors: fromCompiler };
      const seen = new Map<string, number>();
      const fromGate = refusals(program).flatMap((refusal) => {
        const name = named({ ...refusal, start: { line: lineBefore(`${rootDir}/${refusal.file}`, refusal.start.line) } });
        seen.set(name, (seen.get(name) ?? 0) + 1);
        if ((seen.get(name) ?? 0) <= (refusedBefore.get(name) ?? 0)) return [];
        const file = program.getSourceFile(`${rootDir}/${refusal.file}`);
        const at = (position: { readonly line: number; readonly column: number }): number =>
          file === undefined ? 0 : attempt(() => ts.getPositionOfLineAndCharacter(file, position.line - 1, position.column - 1), describe).unwrapOr(0);
        const fixes = file === undefined ? [] : hint({ file, start: at(refusal.start), length: at(refusal.end) - at(refusal.start), code: 0, messageText: refusal.message });
        return [{ where: name, fixes }];
      });
      // The types say nothing true of a project that does not compile.
      const fromCrossings = !compiles
        ? []
        : tellsApart(program, candidates).crossings.map((crossing) => {
            const file = program.getSourceFile(crossing.file);
            return { where: crossing.where, fixes: file === undefined ? [] : hint({ file, start: crossing.start, length: crossing.length, code: 0, messageText: '' }) };
          });
      return { holds: compiles && fromGate.length === 0 && fromCrossings.length === 0, errors: [...fromCompiler, ...fromGate, ...fromCrossings] };
    };
    const first = keepUnblamed(found.filter((fix) => fix.rule !== 'no-null'), judge([]));
    // What could not be made read-only is written: the second chance of each such place is to say so.
    const dropped = new Set(found.filter((fix) => fix.rule === 'readonly-types' && !first.includes(fix)).map((fix) => `${fix.file} ${fix.at}`));
    const second = sources.flatMap((sourceFile) => {
      const wanted = new Set(found.flatMap((fix) => (fix.file === sourceFile.fileName && dropped.has(`${fix.file} ${fix.at}`) ? [fix.at] : [])));
      return wanted.size === 0 ? [] : mutFixes(ts, sourceFile, sourceFile.fileName, wanted);
    });
    const announced = second.length === 0 ? [] : keepUnblamed(second, judge(first));
    // The fixes of `no-null` hold in groups: a type and the values written for it. They are settled after the
    // others, and only ever taken out: whatever an error points at goes, then what no longer compiles without
    // it, until the project holds. Nothing is put back, since a fix that comes back alone breaks its group.
    const settled = (nulls: readonly Fix[]): readonly Fix[] => {
      if (nulls.length === 0) return [];
      const trial = judge([...first, ...announced])(nulls, true);
      if (trial.holds) return nulls;
      const named = new Set(trial.errors.flatMap((error) => error.fixes));
      if (nulls.some((fix) => named.has(fix))) return settled(nulls.filter((fix) => !named.has(fix)));
      // Errors that point at none of them: the fixes of the files they are in go; when none is there, those of the
      // files these import; and all of them when none is there either, since nothing says which to keep.
      const files = new Set(trial.errors.map((error) => error.where.slice(0, error.where.lastIndexOf(':'))).map((name) => (name.startsWith('/') ? name : `${rootDir}/${name}`)));
      const imported = new Set(
        [...files].flatMap((fileName) =>
          (last?.getSourceFile(fileName)?.statements ?? []).flatMap((statement) => {
            const from = ts.isImportDeclaration(statement) ? last?.getTypeChecker().getSymbolAtLocation(statement.moduleSpecifier) : undefined;
            return (from?.getDeclarations() ?? []).map((declaration) => declaration.getSourceFile().fileName);
          }),
        ),
      );
      const near = nulls.filter((fix) => files.has(fix.file));
      const out = near.length > 0 ? near : nulls.filter((fix) => imported.has(fix.file));
      return out.length === 0 ? [] : settled(nulls.filter((fix) => !out.includes(fix)));
    };
    const kept = [...first, ...announced, ...settled(found.filter((fix) => fix.rule === 'no-null'))];
    const saidAt = new Set(announced.map((fix) => `${fix.file} ${fix.at}`));
    withComparisons(kept);

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
      const applied: Mut<Place[]> = mut([]);
      const left: Mut<Place[]> = mut([]);
      const saysMut = (node: ts.Node): boolean =>
        (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) && node.typeName.text === 'Mut') || (ts.forEachChild(node, saysMut) ?? false);
      let program = compile();
      const refusedAtStart = refusals(program).length;
      for (let pass = 0; pass < MUT_PASSES; pass++) {
        const checker = program.getTypeChecker();
        const inserts = new Map<string, Mut<{ at: number; text: string }[]>>();
        const seen = new Set<ts.Node>();
        const insert = (file: ts.SourceFile, at: number, text: string): void => {
          const here = inserts.get(file.fileName) ?? mut([]);
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

          if (refusal.message.startsWith('`this` is mutated') || refusal.message.startsWith('`this`, or a part of it, is given')) {
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
          } else if (refusal.message.startsWith('What the field `') || refusal.message.includes('says the container may be written')) {
            // The field, or the list, that has to say what it holds may be written: named in the message, and read
            // in the statement the refusal is in.
            const isField = refusal.message.startsWith('What the field `');
            const wanted = /^What (?:the field )?`([^`]+)`/.exec(refusal.message)?.[1] ?? '';
            // The write may be through another name (the variable of a loop over the list): the name is looked for
            // in the function the refusal is in, and what it declares has to be a field, a parameter or a variable.
            let scope: ts.Node = place;
            while (!ts.isFunctionLike(scope) && !ts.isSourceFile(scope)) scope = scope.parent;
            // Or a function, when the list is what it gives back: its return type says it.
            const declares = (one: ts.Declaration): boolean => ts.isPropertySignature(one) || ts.isPropertyDeclaration(one) || ts.isParameter(one) || ts.isVariableDeclaration(one) || (!isField && ts.isFunctionLike(one));
            const find = (node: ts.Node): ts.Declaration | undefined => {
              const here = ts.isIdentifier(node) && node.text === wanted ? (checker.getSymbolAtLocation(node)?.declarations ?? []).find(declares) : undefined;
              return here ?? ts.forEachChild(node, find);
            };
            const declaration = find(scope);
            if (declaration === undefined || seen.has(declaration)) continue;
            seen.add(declaration);
            const written = ts.isPropertySignature(declaration) || ts.isPropertyDeclaration(declaration) || ts.isParameter(declaration) || ts.isVariableDeclaration(declaration) || ts.isFunctionLike(declaration) ? declaration.type : undefined;
            if (written === undefined) {
              done(false);
            } else if (isField) {
              done(wrap(written));
            } else {
              // Inside the container: around what an array holds, around the values of a map, around what a set holds.
              let inner: ts.TypeNode = written;
              for (;;) {
                if (ts.isTypeReferenceNode(inner) && ts.isIdentifier(inner.typeName) && inner.typeName.text === 'Mut' && inner.typeArguments?.[0] !== undefined) inner = inner.typeArguments[0];
                else if (ts.isTypeOperatorNode(inner) || ts.isParenthesizedTypeNode(inner)) inner = inner.type;
                else {
                  // A name the project gives to the container: it is said where the name is declared.
                  const symbol = ts.isTypeReferenceNode(inner) ? checker.getSymbolAtLocation(inner.typeName) : undefined;
                  const target = symbol === undefined || (symbol.flags & ts.SymbolFlags.Alias) === 0 ? symbol : checker.getAliasedSymbol(symbol);
                  const alias = (target?.declarations ?? []).find(ts.isTypeAliasDeclaration);
                  if (alias === undefined || !texts.has(alias.getSourceFile().fileName)) break;
                  inner = alias.type;
                }
              }
              const held = ts.isArrayTypeNode(inner) ? inner.elementType : ts.isTypeReferenceNode(inner) && ts.isIdentifier(inner.typeName) ? (HOLDERS[inner.typeName.text] === undefined ? undefined : inner.typeArguments?.[HOLDERS[inner.typeName.text] ?? 0]) : undefined;
              done(held !== undefined && wrap(held));
            }
          } else if (refusal.message.includes('that gave it does not say')) {
            // The name that is written, in the statement the refusal is in; then the call it was made from.
            let statement: ts.Node = place;
            while (!ts.isStatement(statement) && !ts.isSourceFile(statement.parent)) statement = statement.parent;
            const find = (node: ts.Node): ts.Identifier | undefined => (ts.isIdentifier(node) && node.text === named ? node : ts.forEachChild(node, find));
            // With no name in the message, the refusal is on what is given: a name for what a call gave, or the call.
            const name = named === '' ? (ts.isIdentifier(place) ? place : undefined) : find(statement);
            let declaration: ts.Node | undefined = name === undefined ? undefined : checker.getSymbolAtLocation(name)?.valueDeclaration;
            while (declaration !== undefined && (ts.isBindingElement(declaration) || ts.isObjectBindingPattern(declaration) || ts.isArrayBindingPattern(declaration))) declaration = declaration.parent;
            let source: ts.Expression | undefined;
            if (named === '') {
              for (let outer: ts.Node = place; !ts.isSourceFile(outer) && outer.getStart(file) === at; outer = outer.parent) {
                if (ts.isCallExpression(outer)) source = outer;
              }
            }
            if (source === undefined && declaration !== undefined && ts.isVariableDeclaration(declaration)) {
              const loop = declaration.parent.parent;
              source = ts.isForOfStatement(loop) ? loop.expression : declaration.initializer;
            }
            if (source === undefined) continue;
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
      left: [...found.filter((fix) => !kept.includes(fix) && !saidAt.has(`${fix.file} ${fix.at}`)).map(place), ...receivers.left],
      written: dryRun ? [] : [...changed.keys()].map(relative).toSorted(),
    });
  }, describe);
  return outcome.andThen((result) => result);
}
