// The editor's adapter around core: a TypeScript language service plugin. It adds what the rules refuse to the
// file's diagnostics, with the same engine, rules and messages as the CLI. It holds no rule.
import { compare, parseBaseline } from '@strict-ts/cli/baseline';
import { CONFIG_FILE, readSettings, type Settings } from '@strict-ts/cli/settings';
import { check, type Diagnostic, rules } from '@strict-ts/core';
import { createTypeScript6Provider } from '@strict-ts/core/typescript6';
import { none, ok, type Option, type Result, some } from '@strict-ts/std';
import type ts from '@typescript/typescript6';
import { parseJson } from './unsafe/json.js';

/** Diagnostic codes start here, one per rule in the catalogue's order: an editor shows « strict-ts(90001) ». */
const FIRST_CODE = 90001;
const SOURCE = 'strict-ts';

/** What the plugin needs from its host: reading a file that may be absent. */
type ReadFile = (path: string) => string | undefined;

const readJson = (readFile: ReadFile, path: string): Result<Option<unknown>, string> => {
  const text = readFile(path);
  return text === undefined ? ok(none) : parseJson(text, path).map(some);
};

interface Checked {
  /** What the gate refuses in the file. */
  readonly refused: readonly Diagnostic[];
  /** What the baseline allows there: shown, but as a warning. */
  readonly baselined: readonly Diagnostic[];
}

/** Checks one file of a program as the gate would, the baseline included. */
export function checkFile(
  api: typeof ts,
  program: ts.Program,
  rootDir: string,
  fileName: string,
  readFile: ReadFile,
): Result<Checked, string> {
  const settings: Result<Settings, string> = readJson(readFile, `${rootDir}/${CONFIG_FILE}`).andThen(readSettings);
  if (!settings.ok) return settings;
  const provider = createTypeScript6Provider(api, program, {
    rootDir,
    only: (candidate) => candidate === fileName,
    compilerDiagnostics: false,
  });
  // The project-wide rule speaks about tsconfig.json: it is the gate's to report, not this file's.
  const found = check(provider, settings.value.config).filter((diagnostic) => provider.files.some((file) => file.name === diagnostic.file));
  const recorded = readJson(readFile, `${rootDir}/${settings.value.baseline}`);
  if (!recorded.ok) return recorded;
  if (!recorded.value.some) return ok({ refused: found, baselined: [] });
  return parseBaseline(recorded.value.value)
    .mapErr((error) => `${settings.value.baseline}: ${error}`)
    .map((baseline) => {
      const { refused, baselined } = compare(found, baseline);
      return { refused, baselined };
    });
}

function init(modules: { readonly typescript: typeof ts }): ts.server.PluginModule {
  const api = modules.typescript;

  const create = (info: ts.server.PluginCreateInfo): ts.LanguageService => {
    const service = info.languageService;
    const rootDir = info.project.getCurrentDirectory().replaceAll('\\', '/');
    const readFile: ReadFile = (path) => info.serverHost.readFile(path);

    const toEditor = (sourceFile: ts.SourceFile, d: Diagnostic, baselined: boolean): ts.Diagnostic => {
      const offset = (line: number, column: number): number =>
        api.getPositionOfLineAndCharacter(sourceFile, Math.max(line - 1, 0), Math.max(column - 1, 0));
      const start = offset(d.start.line, d.start.column);
      const text = [
        `${d.rule}: ${d.message}`,
        ...(d.help === undefined ? [] : [`help: ${d.help}`]),
        ...(baselined ? ['note: allowed by the baseline'] : []),
      ].join('\n');
      const index = rules.findIndex((rule) => rule.name === d.rule);
      return {
        file: sourceFile,
        start,
        length: Math.max(offset(d.end.line, d.end.column) - start, 1),
        messageText: text,
        category: baselined ? api.DiagnosticCategory.Warning : api.DiagnosticCategory.Error,
        code: FIRST_CODE + Math.max(index, 0),
        source: SOURCE,
      };
    };

    const strictDiagnostics = (fileName: string): readonly ts.Diagnostic[] => {
      const program = service.getProgram();
      const sourceFile = program?.getSourceFile(fileName);
      if (program === undefined || sourceFile === undefined) return [];
      const checked = checkFile(api, program, rootDir, sourceFile.fileName, readFile);
      if (!checked.ok) {
        // A configuration that cannot be read checks nothing: the file says so, rather than looking conforming.
        return [
          {
            file: sourceFile,
            start: 0,
            length: 1,
            messageText: `strict-ts did not check this file: ${checked.error}`,
            category: api.DiagnosticCategory.Error,
            code: FIRST_CODE - 1,
            source: SOURCE,
          },
        ];
      }
      return [
        ...checked.value.refused.map((d) => toEditor(sourceFile, d, false)),
        ...checked.value.baselined.map((d) => toEditor(sourceFile, d, true)),
      ];
    };

    // Every other method of the language service is the editor's own.
    return {
      ...service,
      getSemanticDiagnostics: (fileName) => [...service.getSemanticDiagnostics(fileName), ...strictDiagnostics(fileName)],
    };
  };

  return { create };
}

export default init;
