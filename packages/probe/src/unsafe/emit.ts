// unsafe/: the compiler. Emits the instrumented JavaScript of a project's files.
import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { packageNameOf } from '@strict-ts/cli/package-name';
import { CONFIG_FILE, readSettings } from '@strict-ts/cli/settings';
import { calleeReader, checkedFileNames } from '@strict-ts/core/typescript6';
import { attempt, err, none, ok, type Option, type Result, some } from '@strict-ts/std';
import ts from '@typescript/typescript6';
import { allProbes, instrument, PROBE, type Probes } from '../transform.js';
import { install } from '../runtime.js';

/** An instrumented module: its JavaScript, with the probes' runtime and its sites at the top, and its source map. */
export interface Emitted {
  readonly code: string;
  readonly map: string | undefined;
  readonly sites: number;
}

export interface Instrumenter {
  readonly rootDir: string;
  /** The project's own files, by absolute path: what can be instrumented. */
  readonly files: readonly string[];
  /** The instrumented JavaScript of a file, or none when it is not one of the project's. */
  readonly emit: (fileName: string) => Result<Option<Emitted>, string>;
}

const describe = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

/**
 * Opens the project of a tsconfig.json (the file or its directory) for instrumenting. `events` is the file the
 * probes append what they see to.
 */
export function openInstrumenter(cwd: string, project: string | undefined, events: string, probes: Probes = allProbes): Result<Instrumenter, string> {
  const opened = attempt((): Result<Instrumenter, string> => {
    const target = resolve(cwd, project ?? '.');
    if (!existsSync(target)) return err(`${target} does not exist`);
    const tsconfig = statSync(target).isDirectory() ? join(target, 'tsconfig.json') : target;
    if (!existsSync(tsconfig)) return err(`${tsconfig} does not exist`);
    const rootDir = dirname(tsconfig).replace(/\\/g, '/');
    const parsed = ts.getParsedCommandLineOfConfigFile(tsconfig, undefined, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} });
    if (parsed === undefined) return err(`${tsconfig}: unreadable`);
    const readText = (path: string): Option<unknown> => {
      const text = ts.sys.readFile(path);
      return text === undefined ? none : some<unknown>(JSON.parse(text));
    };
    const settings = readSettings(readText(`${rootDir}/${CONFIG_FILE}`));
    if (!settings.ok) return err(settings.error);

    // The same program as the gate checks, emitted as modules a test runner can load.
    const options: ts.CompilerOptions = {
      ...parsed.options,
      noEmit: false,
      emitDeclarationOnly: false,
      declaration: false,
      declarationMap: false,
      composite: false,
      incremental: false,
      noEmitOnError: false,
      sourceMap: true,
      inlineSources: true,
      module: ts.ModuleKind.ESNext,
    };
    const program = ts.createProgram({ rootNames: parsed.fileNames, options });
    const checker = program.getTypeChecker();
    const calleeOf = calleeReader(ts, program, rootDir, (fileName) => packageNameOf(ts.sys.readFile, fileName).unwrapOr(undefined));
    const files = checkedFileNames(program, rootDir);
    const runtime = `const ${PROBE} = (${install.toString()})(${JSON.stringify(events)});\n`;

    const emit = (fileName: string): Result<Option<Emitted>, string> =>
      attempt((): Option<Emitted> => {
        const sourceFile = program.getSourceFile(fileName.replace(/\\/g, '/'));
        if (sourceFile === undefined || !files.includes(sourceFile.fileName)) return none;
        const { transformer, sites } = instrument(ts, checker, sourceFile.fileName.slice(rootDir.length + 1), settings.value.config, calleeOf, probes);
        let code = '';
        let map: string | undefined;
        program.emit(
          sourceFile,
          (name, text) => {
            if (name.endsWith('.map')) map = text;
            else code = text;
          },
          undefined,
          false,
          { before: [transformer] },
        );
        const header = `${runtime}const ${PROBE}first = ${PROBE}.sites(${JSON.stringify(sites())});\n`;
        // The header pushes the module down by its number of lines: the source map is shifted by as many.
        const shift = ''.padEnd(header.split('\n').length - 1, ';');
        const shifted = map === undefined ? undefined : JSON.stringify({ ...JSON.parse(map), mappings: `${shift}${JSON.parse(map).mappings}` });
        return some({ code: `${header}${code.replace(/\n\/\/# sourceMappingURL=.*$/, '')}`, map: shifted, sites: sites().length });
      }, describe);

    return ok({ rootDir, files, emit });
  }, describe);
  return opened.andThen((result) => result);
}
