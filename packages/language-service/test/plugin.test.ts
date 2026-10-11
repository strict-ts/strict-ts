// The plugin as tsserver loads it: the built CommonJS file, required, given a compiler and a language service.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from '@typescript/typescript6';
import { afterEach, describe, expect, test } from 'vitest';

const built = fileURLToPath(new URL('../dist/index.cjs', import.meta.url));
const fixtures = fileURLToPath(new URL('../../cli/test/fixtures/', import.meta.url));
const init = createRequire(import.meta.url)(built);

const copies: string[] = [];
function project(name: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'strict-ts-ls-'));
  copies.push(directory);
  cpSync(join(fixtures, name), directory, { recursive: true });
  return directory;
}
afterEach(() => {
  for (const directory of copies.splice(0)) rmSync(directory, { recursive: true, force: true });
});

/** A language service on a project directory, wrapped by the plugin as tsserver would. */
function editor(directory: string) {
  const parsed = ts.getParsedCommandLineOfConfigFile(join(directory, 'tsconfig.json'), undefined, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: () => {},
  });
  if (parsed === undefined) throw new Error('fixture without tsconfig.json');
  const versions = new Map<string, number>();
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => parsed.fileNames,
    getScriptVersion: (fileName) => String(versions.get(fileName) ?? 0),
    getScriptSnapshot: (fileName) => {
      const text = ts.sys.readFile(fileName);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => directory,
    getCompilationSettings: () => parsed.options,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
  };
  const plain = ts.createLanguageService(host);
  const service: ts.LanguageService = init({ typescript: ts }).create({
    languageService: plain,
    project: { getCurrentDirectory: () => directory },
    serverHost: ts.sys,
    config: {},
  });
  const diagnostics = (file: string) =>
    service.getSemanticDiagnostics(join(directory, file)).map((d) => {
      const { line, character } = ts.getLineAndCharacterOfPosition(d.file ?? ts.createSourceFile('', '', 99), d.start ?? 0);
      return {
        at: `${line + 1}:${character + 1}`,
        length: d.length,
        category: ts.DiagnosticCategory[d.category],
        source: d.source,
        code: d.code,
        text: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
      };
    });
  const edit = (file: string, text: string): void => {
    writeFileSync(join(directory, file), text);
    versions.set(join(directory, file), (versions.get(join(directory, file)) ?? 0) + 1);
  };
  return { service, plain, diagnostics, edit };
}

describe('the plugin', () => {
  test('is a CommonJS module that is the factory tsserver expects', () => {
    expect(readFileSync(built, 'utf8')).toContain('module.exports = module.exports.default;');
    expect(typeof init).toBe('function');
    expect(typeof init({ typescript: ts }).create).toBe('function');
  });

  test('underlines a violation with the rule, its message and its help', () => {
    const { diagnostics } = editor(project('legacy'));
    expect(diagnostics('src/billing.ts')).toEqual([
      {
        at: '2:68',
        length: 11,
        category: 'Error',
        source: 'strict-ts',
        code: 90003,
        text: 'no-non-null: `!` assertion forbidden.\nhelp: Handle the `undefined` case explicitly, or return an Option.',
      },
    ]);
  });

  test('gives the same diagnostics as the CLI, file by file', () => {
    const { diagnostics } = editor(project('legacy'));
    expect(diagnostics('src/orders.ts').map((d) => `${d.at} ${d.text.split(':')[0]}`)).toEqual([
      '3:17 no-any',
      '4:20 no-throw',
      '5:10 no-cast',
    ]);
    expect(diagnostics('src/clean.ts')).toEqual([]);
  });

  test("keeps the editor's own diagnostics, and adds its own after them", () => {
    const { diagnostics, edit } = editor(project('legacy'));
    edit('src/clean.ts', 'export const double = (n: number): string => n * 2;\nexport const nothing = null;\n');
    expect(diagnostics('src/clean.ts').map((d) => `${d.source ?? 'ts'} ${d.code}`)).toEqual(['ts 2322', 'strict-ts 90005']);
  });

  test('follows the edits: a fixed violation is no longer underlined', () => {
    const { diagnostics, edit } = editor(project('legacy'));
    expect(diagnostics('src/billing.ts')).toHaveLength(1);
    edit('src/billing.ts', 'export const firstAmount = (amounts: readonly number[]) => amounts[0] ?? 0;\n');
    expect(diagnostics('src/billing.ts')).toEqual([]);
  });

  test('reads strict-ts.json: rules and unsafe directories', () => {
    const directory = project('legacy');
    writeFileSync(join(directory, 'strict-ts.json'), '{ "rules": ["no-cast"] }');
    expect(editor(directory).diagnostics('src/orders.ts').map((d) => d.text.split(':')[0])).toEqual(['no-cast']);
    writeFileSync(join(directory, 'strict-ts.json'), '{ "unsafeDirs": ["src"], "rules": ["no-cast", "safety-comment"] }');
    expect(editor(directory).diagnostics('src/orders.ts').map((d) => d.text.split(':')[0])).toEqual(['safety-comment']);
  });

  test('shows what the baseline allows as a warning, and what goes beyond it as an error', () => {
    const directory = project('legacy');
    writeFileSync(
      join(directory, 'strict-ts-baseline.json'),
      JSON.stringify({ version: 1, files: { 'src/billing.ts': { 'no-non-null': 1 }, 'src/orders.ts': { 'no-cast': 1 } } }),
    );
    const { diagnostics } = editor(directory);
    expect(diagnostics('src/billing.ts').map((d) => `${d.category} ${d.text.split('\n').at(-1)}`)).toEqual([
      'Warning note: allowed by the baseline',
    ]);
    expect(diagnostics('src/orders.ts').map((d) => `${d.category} ${d.text.split(':')[0]}`)).toEqual([
      'Error no-any',
      'Error no-throw',
      'Warning no-cast',
    ]);
  });

  test('a configuration that cannot be read is said on the file, which is not shown as conforming', () => {
    const directory = project('legacy');
    writeFileSync(join(directory, 'strict-ts.json'), '{ "rules": ["no-cats"] }');
    expect(editor(directory).diagnostics('src/clean.ts')).toEqual([
      {
        at: '1:1',
        length: 1,
        category: 'Error',
        source: 'strict-ts',
        code: 90000,
        text: 'strict-ts did not check this file: strict-ts.json: unknown rule "no-cats"',
      },
    ]);
  });

  test('leaves every other method of the language service alone', () => {
    const { service, plain } = editor(project('legacy'));
    expect(service.getProgram()).toBe(plain.getProgram());
    expect(service.getSyntacticDiagnostics).toBeTypeOf('function');
  });
});
