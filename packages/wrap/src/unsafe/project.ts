// unsafe/: the file system and the compiler. Everything that may throw leaves here as a Result.
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { attempt, err, type Result } from '@strict-ts/std';
import ts from '@typescript/typescript6';
import { generateWrapper, type Wrapper } from '../generate.js';

const describe = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));
const flatten = (diagnostic: ts.Diagnostic): string => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');

/**
 * Reads the exports of `module` as the project of `project` (a tsconfig.json or its directory) resolves it, and
 * generates its wrapper.
 */
export function wrapModule(cwd: string, project: string | undefined, module: string): Result<Wrapper, string> {
  const generated = attempt((): Result<Wrapper, string> => {
    const target = resolve(cwd, project ?? '.');
    if (!existsSync(target)) return err(`${target} does not exist`);
    const tsconfig = statSync(target).isDirectory() ? join(target, 'tsconfig.json') : target;
    if (!existsSync(tsconfig)) return err(`${tsconfig} does not exist`);
    const fatal: string[] = [];
    const parsed = ts.getParsedCommandLineOfConfigFile(tsconfig, undefined, {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (d) => fatal.push(flatten(d)),
    });
    if (parsed === undefined || fatal.length > 0) return err(`${tsconfig}: ${fatal.join('\n') || 'unreadable'}`);

    // A file that exists only for this run imports the module, so that the project's own resolution finds it.
    const probe = join(dirname(tsconfig), '__strict_ts_wrap__.ts');
    const text = `import * as lib from ${JSON.stringify(module)};\nexport { lib };\n`;
    const host = ts.createCompilerHost(parsed.options);
    const program = ts.createProgram({
      rootNames: [probe],
      options: { ...parsed.options, noEmit: true },
      host: {
        ...host,
        fileExists: (fileName) => fileName === probe || host.fileExists(fileName),
        readFile: (fileName) => (fileName === probe ? text : host.readFile(fileName)),
        getSourceFile: (fileName, languageVersion, onError, shouldCreate) =>
          fileName === probe
            ? ts.createSourceFile(fileName, text, languageVersion, true)
            : host.getSourceFile(fileName, languageVersion, onError, shouldCreate),
      },
    });
    const checker = program.getTypeChecker();
    const source = program.getSourceFile(probe);
    const statement = source?.statements[0];
    if (source === undefined || statement === undefined || !ts.isImportDeclaration(statement)) return err('the probe did not compile');
    if (checker.getSymbolAtLocation(statement.moduleSpecifier) === undefined) return err(`cannot resolve "${module}" from ${tsconfig}`);
    const binding = statement.importClause?.namedBindings;
    if (binding === undefined || !ts.isNamespaceImport(binding)) return err('the probe did not compile');
    // The properties of the namespace are the module's values, whether it writes `export` or `export =`.
    const exported = checker.getPropertiesOfType(checker.getTypeAtLocation(binding.name));
    return generateWrapper(ts, checker, module, exported, statement);
  }, describe);
  return generated.andThen((result) => result);
}

/** Writes the generated file, creating its directory. Returns the path written. */
export function writeWrapper(cwd: string, file: string, text: string): Result<string, string> {
  const path = resolve(cwd, file);
  return attempt(
    (): string => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
      return path;
    },
    (cause) => `${path}: ${describe(cause)}`,
  );
}
