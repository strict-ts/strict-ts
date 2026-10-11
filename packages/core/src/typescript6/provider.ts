// The TypeProvider of the TypeScript 6 API, and the only place in core that knows a compiler. The compiler itself is
// passed in by the caller (the CLI imports it, the playground loads it in the page), so core imports its types only.
import type ts from '@typescript/typescript6';
import { type Diagnostic, diagnosticAt, locator, type Position } from '../diagnostic.js';
import type { ExportedValue, SourceFile, Type, TypeProvider } from '../provider.js';
import type { Node } from '../syntax.js';

export interface TypeScript6Options {
  /** The project root, absolute. Only files under it are checked, and diagnostics show paths relative to it. */
  readonly rootDir: string;
}

export function createTypeScript6Provider(
  api: typeof ts,
  program: ts.Program,
  options: TypeScript6Options,
): TypeProvider {
  const checker = program.getTypeChecker();
  const root = `${options.rootDir.replaceAll('\\', '/').replace(/\/+$/, '')}/`;
  const displayName = (fileName: string): string => (fileName.startsWith(root) ? fileName.slice(root.length) : fileName);

  const literal =
    api.TypeFlags.StringLiteral |
    api.TypeFlags.NumberLiteral |
    api.TypeFlags.BooleanLiteral |
    api.TypeFlags.EnumLiteral |
    api.TypeFlags.Undefined;

  const wrapType = (type: ts.Type): Type => {
    const symbolName = type.getSymbol()?.getName();
    const isPromise = symbolName === 'Promise' || symbolName === 'PromiseLike';
    const self: Type = {
      get text() {
        return checker.typeToString(type);
      },
      isAny: (type.flags & api.TypeFlags.Any) !== 0,
      isLiteral: (type.flags & literal) !== 0,
      isBooleanLiteral: (type.flags & api.TypeFlags.BooleanLiteral) !== 0,
      isPromise,
      get members() {
        return type.isUnion() ? type.types.map(wrapType) : [self];
      },
      get awaited() {
        return isPromise ? wrapType(checker.getAwaitedType(type) ?? type) : self;
      },
      property: (name) => {
        const symbol = type.getProperty(name);
        return symbol === undefined ? undefined : wrapType(checker.getTypeOfSymbol(symbol));
      },
      get properties() {
        return type.getProperties().map((symbol) => wrapType(checker.getTypeOfSymbol(symbol)));
      },
      get returns() {
        return type.getCallSignatures().map((signature) => wrapType(signature.getReturnType()));
      },
    };
    return self;
  };

  // Each compiler node is converted once, children first, so a parent finds its parts already converted.
  const converted = new Map<ts.Node, Node>();
  const origin = new WeakMap<Node, ts.Node>();

  const convert = (node: ts.Node, sourceFile: ts.SourceFile): Node => {
    const children: Node[] = [];
    api.forEachChild(node, (child) => {
      children.push(convert(child, sourceFile));
    });
    const part = (child: ts.Node): Node => converted.get(child) ?? convert(child, sourceFile);
    const base = { start: node.getStart(sourceFile), end: node.getEnd(), children };

    const shape = (): Node => {
      if (node.kind === api.SyntaxKind.AnyKeyword) return { ...base, kind: 'any-keyword' };
      if (node.kind === api.SyntaxKind.NullKeyword) return { ...base, kind: 'null-keyword' };
      if (node.kind === api.SyntaxKind.ImportKeyword) return { ...base, kind: 'import-keyword' };
      if (api.isIdentifier(node)) return { ...base, kind: 'identifier', text: node.text };
      if (api.isStringLiteralLike(node)) return { ...base, kind: 'string-literal', text: node.text };
      if (api.isCallExpression(node)) {
        return { ...base, kind: 'call', callee: part(node.expression), arguments: node.arguments.map(part) };
      }
      if (api.isNewExpression(node)) return { ...base, kind: 'new' };
      if (api.isPropertyAccessExpression(node)) return { ...base, kind: 'property-access' };
      if (api.isElementAccessExpression(node)) return { ...base, kind: 'element-access' };
      if (api.isAwaitExpression(node)) return { ...base, kind: 'await' };
      if (api.isVoidExpression(node)) return { ...base, kind: 'void' };
      if (api.isNonNullExpression(node)) return { ...base, kind: 'non-null' };
      if (api.isAsExpression(node)) {
        const target = node.type;
        const isConst =
          api.isTypeReferenceNode(target) && api.isIdentifier(target.typeName) && target.typeName.text === 'const';
        return { ...base, kind: 'as', isConst };
      }
      if (api.isTypeAssertionExpression(node)) return { ...base, kind: 'type-assertion' };
      if (api.isBinaryExpression(node)) {
        return { ...base, kind: 'binary', operator: api.tokenToString(node.operatorToken.kind) ?? '' };
      }
      if (api.isThrowStatement(node)) return { ...base, kind: 'throw' };
      if (api.isExpressionStatement(node)) {
        return { ...base, kind: 'expression-statement', expression: part(node.expression) };
      }
      if (api.isSwitchStatement(node)) {
        return { ...base, kind: 'switch', expression: part(node.expression), clauses: node.caseBlock.clauses.map(part) };
      }
      if (api.isCaseClause(node)) return { ...base, kind: 'case-clause', expression: part(node.expression) };
      if (api.isDefaultClause(node)) return { ...base, kind: 'default-clause' };
      if (api.isImportDeclaration(node)) {
        return { ...base, kind: 'module-reference', specifier: part(node.moduleSpecifier) };
      }
      if (api.isExportDeclaration(node)) {
        const specifier = node.moduleSpecifier === undefined ? undefined : part(node.moduleSpecifier);
        return { ...base, kind: 'module-reference', specifier };
      }
      if (api.isImportEqualsDeclaration(node) && api.isExternalModuleReference(node.moduleReference)) {
        return { ...base, kind: 'module-reference', specifier: part(node.moduleReference.expression) };
      }
      if (api.isImportTypeNode(node)) {
        const specifier = api.isLiteralTypeNode(node.argument) ? part(node.argument.literal) : undefined;
        return { ...base, kind: 'module-reference', specifier };
      }
      return { ...base, kind: 'other' };
    };

    const result = shape();
    converted.set(node, result);
    origin.set(result, node);
    return result;
  };

  const sources = new WeakMap<SourceFile, ts.SourceFile>();
  const files = program
    .getSourceFiles()
    .filter(
      (sourceFile) =>
        !sourceFile.isDeclarationFile &&
        !program.isSourceFileFromExternalLibrary(sourceFile) &&
        !sourceFile.fileName.includes('/node_modules/') &&
        sourceFile.fileName.startsWith(root),
    )
    .map((sourceFile): SourceFile => {
      const file = { name: displayName(sourceFile.fileName), text: sourceFile.text, root: convert(sourceFile, sourceFile) };
      sources.set(file, sourceFile);
      return file;
    });

  const locators = new Map<ts.SourceFile, (offset: number) => Position>();
  const locatorOf = (sourceFile: ts.SourceFile): ((offset: number) => Position) => {
    const known = locators.get(sourceFile);
    if (known !== undefined) return known;
    const created = locator(sourceFile.text);
    locators.set(sourceFile, created);
    return created;
  };

  const compilerDiagnostics = api.getPreEmitDiagnostics(program).map((diagnostic): Diagnostic => {
    const rule = `TS${diagnostic.code}`;
    const message = api.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    if (diagnostic.file === undefined || diagnostic.start === undefined) {
      return { rule, file: '', start: { line: 0, column: 0 }, end: { line: 0, column: 0 }, message };
    }
    const span = { start: diagnostic.start, end: diagnostic.start + (diagnostic.length ?? 1) };
    return diagnosticAt(rule, displayName(diagnostic.file.fileName), locatorOf(diagnostic.file), span, message);
  });

  // A node this provider did not build has no type it can vouch for: it is `any`, which the rules refuse.
  const unknownOrigin: Type = {
    text: 'any',
    isAny: true,
    isLiteral: false,
    isBooleanLiteral: false,
    isPromise: false,
    get members() {
      return [unknownOrigin];
    },
    get awaited() {
      return unknownOrigin;
    },
    property: () => undefined,
    properties: [],
    returns: [],
  };

  return {
    files,
    compilerOptions: program.getCompilerOptions(),
    compilerDiagnostics,
    typeOf: (node) => {
      const source = origin.get(node);
      return source === undefined ? unknownOrigin : wrapType(checker.getTypeAtLocation(source));
    },
    exportsOf: (file) => {
      const sourceFile = sources.get(file);
      const module = sourceFile === undefined ? undefined : checker.getSymbolAtLocation(sourceFile);
      if (sourceFile === undefined || module === undefined) return [];
      const exported: ExportedValue[] = [];
      for (const symbol of checker.getExportsOfModule(module)) {
        const target = (symbol.flags & api.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
        if ((target.flags & api.SymbolFlags.Value) === 0) continue;
        const declaration = target.valueDeclaration ?? target.declarations?.[0];
        if (declaration === undefined) continue;
        // A re-export is declared in another file: the diagnostic goes on the export written in this one.
        const named = [api.getNameOfDeclaration(declaration) ?? declaration, ...(symbol.declarations ?? [])].find(
          (candidate) => candidate.getSourceFile() === sourceFile,
        );
        exported.push({
          name: symbol.getName(),
          start: named?.getStart(sourceFile) ?? 0,
          end: named?.getEnd() ?? 0,
          type: wrapType(checker.getTypeOfSymbolAtLocation(target, declaration)),
        });
      }
      return exported;
    },
  };
}
