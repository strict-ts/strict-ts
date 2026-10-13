// The playground's adapter around core: it builds a TypeScript 6 program from the files held in the page and hands it
// to the rules. No rule logic lives here.
import { check, type Diagnostic, requiredCompilerOptions, rules } from '@strict-ts/core';
import { createTypeScript6Provider } from '@strict-ts/core/typescript6';
import { mut, type Mut } from '@strict-ts/std';
import type ts from '@typescript/typescript6';

/** What a scenario is compiled against: the compiler's libraries, the standard library's sources, the ambient globals. */
export interface Environment {
  readonly libs: Readonly<Record<string, string>>;
  readonly std: Readonly<Record<string, string>>;
  readonly ambient: string;
}

export interface Request {
  readonly files: Readonly<Record<string, string>>;
  readonly unsafeDirs: readonly string[];
  readonly allowedImports: readonly string[];
  readonly compilerFlags: Readonly<Record<string, boolean>>;
  readonly enabledRules: readonly string[];
}

export interface Outcome {
  readonly diagnostics: readonly Diagnostic[];
  readonly filesChecked: number;
  readonly durationMs: number;
}

export type TokenClass = 'kw' | 'str' | 'num' | 'com' | 'type' | 'fn' | 'punc';
export type Token = readonly [start: number, end: number, tokenClass: TokenClass];

export interface Playground {
  readonly version: string;
  readonly rules: typeof rules;
  readonly requiredCompilerOptions: readonly string[];
  readonly check: (request: Request) => Outcome;
  /** The tokens of a text, for syntax colouring. */
  readonly classify: (text: string) => readonly Token[];
}

const PROJECT = '/project';
const STD = '/std';
const LIB = '/lib';
const ENV = '/env/env.d.ts';
/** How the standard library's files are named in the page and in diagnostics. */
export const STD_NAME = '@strict-ts/std';

export function createPlayground(api: typeof ts, environment: Environment): Playground {
  const parsed = mut(new Map<string, { readonly text: string; readonly sourceFile: ts.SourceFile }>());
  let previous: ts.Program | undefined;

  const parse = (fileName: string, text: string): ts.SourceFile => {
    const known = parsed.get(fileName);
    if (known !== undefined && known.text === text) return known.sourceFile;
    const sourceFile = api.createSourceFile(fileName, text, api.ScriptTarget.ES2022, true);
    parsed.set(fileName, { text, sourceFile });
    return sourceFile;
  };

  const run = (request: Request): Outcome => {
    const started = performance.now();
    const files = mut(new Map<string, string>());
    for (const [name, text] of Object.entries(environment.libs)) files.set(`${LIB}/${name}`, text);
    for (const [name, text] of Object.entries(environment.std)) files.set(`${STD}/${name}`, text);
    // The ambient globals sit outside the project, as a dependency's types would.
    files.set(ENV, environment.ambient);
    const rootNames = mut([ENV]);
    for (const [name, text] of Object.entries(request.files)) {
      files.set(`${PROJECT}/${name}`, text);
      rootNames.push(`${PROJECT}/${name}`);
    }

    const options: Mut<ts.CompilerOptions> = mut({
      target: api.ScriptTarget.ES2022,
      module: api.ModuleKind.ESNext,
      moduleResolution: api.ModuleResolutionKind.Bundler,
      lib: ['lib.es2022.d.ts'],
      types: [],
      noEmit: true,
      paths: { [STD_NAME]: [`${STD}/index.ts`] },
    });
    // The flags of the page are options by their names: each is written as one.
    for (const [flag, on] of Object.entries(request.compilerFlags)) options[flag] = on;
    const host: ts.CompilerHost = {
      getSourceFile: (fileName) => {
        const text = files.get(fileName);
        return text === undefined ? undefined : parse(fileName, text);
      },
      getDefaultLibFileName: () => `${LIB}/lib.es2022.d.ts`,
      getDefaultLibLocation: () => LIB,
      writeFile: () => {},
      getCurrentDirectory: () => PROJECT,
      getCanonicalFileName: (fileName) => fileName,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => '\n',
      fileExists: (fileName) => files.has(fileName),
      readFile: (fileName) => files.get(fileName),
      directoryExists: (directory) => {
        const prefix = directory.endsWith('/') ? directory : `${directory}/`;
        return [...files.keys()].some((fileName) => fileName.startsWith(prefix));
      },
      getDirectories: () => [],
    };
    const program = api.createProgram({
      rootNames,
      options,
      host,
      ...(previous === undefined ? {} : { oldProgram: previous }),
    });
    previous = program;

    // The standard library is compiled from its sources, held in the page under one directory.
    const packageNameOf = (fileName: string): string | undefined => (fileName.startsWith(`${STD}/`) ? STD_NAME : undefined);
    const provider = createTypeScript6Provider(api, program, { rootDir: PROJECT, packageNameOf });
    const found = check(provider, {
      unsafeDirs: request.unsafeDirs,
      allowedImports: request.allowedImports,
      rules: request.enabledRules,
    });
    const diagnostics = found.map((diagnostic) =>
      diagnostic.file.startsWith(`${STD}/`) ? { ...diagnostic, file: `${STD_NAME}/${diagnostic.file.slice(STD.length + 1)}` } : diagnostic,
    );
    return { diagnostics, filesChecked: provider.files.length, durationMs: performance.now() - started };
  };

  const classOf = (kind: ts.SyntaxKind, text: string, start: number, end: number): TokenClass | undefined => {
    if (kind >= api.SyntaxKind.FirstKeyword && kind <= api.SyntaxKind.LastKeyword) return 'kw';
    switch (kind) {
      case api.SyntaxKind.StringLiteral:
      case api.SyntaxKind.NoSubstitutionTemplateLiteral:
      case api.SyntaxKind.TemplateHead:
      case api.SyntaxKind.TemplateMiddle:
      case api.SyntaxKind.TemplateTail:
        return 'str';
      case api.SyntaxKind.NumericLiteral:
      case api.SyntaxKind.BigIntLiteral:
        return 'num';
      case api.SyntaxKind.SingleLineCommentTrivia:
      case api.SyntaxKind.MultiLineCommentTrivia:
        return 'com';
      case api.SyntaxKind.Identifier: {
        const first = text.charCodeAt(start);
        if (first >= 65 && first <= 90) return 'type';
        let next = end;
        while (text[next] === ' ') next++;
        return text[next] === '(' ? 'fn' : undefined;
      }
      case api.SyntaxKind.EqualsGreaterThanToken:
      case api.SyntaxKind.ExclamationToken:
      case api.SyntaxKind.QuestionDotToken:
        return 'punc';
      default:
        return undefined;
    }
  };

  const classify = (text: string): readonly Token[] => {
    const scanner = api.createScanner(api.ScriptTarget.Latest, false, api.LanguageVariant.Standard, text);
    const tokens: Mut<Token[]> = mut([]);
    // The brace depth at which each open template literal resumes.
    const templates: Mut<number[]> = mut([]);
    let depth = 0;
    let kind = scanner.scan();
    while (kind !== api.SyntaxKind.EndOfFileToken) {
      if (kind === api.SyntaxKind.CloseBraceToken && templates.at(-1) === depth) {
        kind = scanner.reScanTemplateToken(false);
        if (kind === api.SyntaxKind.TemplateTail) templates.pop();
      } else if (kind === api.SyntaxKind.OpenBraceToken) depth++;
      else if (kind === api.SyntaxKind.CloseBraceToken) depth--;
      else if (kind === api.SyntaxKind.TemplateHead) templates.push(depth);
      const start = scanner.getTokenStart();
      const end = scanner.getTokenEnd();
      const tokenClass = classOf(kind, text, start, end);
      if (tokenClass !== undefined) tokens.push([start, end, tokenClass]);
      kind = scanner.scan();
    }
    return tokens;
  };

  return { version: api.version, rules, requiredCompilerOptions, check: run, classify };
}
