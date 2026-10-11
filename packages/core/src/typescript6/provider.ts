// The TypeProvider of the TypeScript 6 API, and the only place in core that knows a compiler. The compiler itself is
// passed in by the caller (the CLI imports it, the playground loads it in the page), so core imports its types only.
import type ts from '@typescript/typescript6';
import { type Diagnostic, diagnosticAt, locator, type Position } from '../diagnostic.js';
import type { Mut } from '../mut.js';
import type { ExportedValue, SourceFile, Type, TypeProvider } from '../provider.js';
import type { Node } from '../syntax.js';

export interface TypeScript6Options {
  /** The project root, absolute. Only files under it are checked, and diagnostics show paths relative to it. */
  readonly rootDir: string;
  /**
   * Restricts the files to check, by absolute path: an editor asks about one file at a time. The files left out
   * are still compiled, so the types of the others are right.
   */
  readonly only?: (fileName: string) => boolean;
  /**
   * `false` leaves the compiler's own errors out, for a host that already shows them (an editor). The gate must
   * keep them: it is what replaces `tsc --noEmit`.
   */
  readonly compilerDiagnostics?: boolean;
  /**
   * The name of the package a file belongs to, for a host that can read package.json. Without it the name is read
   * from the path, after the last `node_modules/`.
   */
  readonly packageNameOf?: (fileName: string) => string | undefined;
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

  /** The project's own sources: what the rules read. Everything else is compiled and taken on trust. */
  const isChecked = (sourceFile: ts.SourceFile): boolean =>
    !sourceFile.isDeclarationFile &&
    !program.isSourceFileFromExternalLibrary(sourceFile) &&
    !sourceFile.fileName.includes('/node_modules/') &&
    sourceFile.fileName.startsWith(root);

  const isUnit = (node: ts.Node): boolean =>
    (node.kind >= api.SyntaxKind.FirstStatement && node.kind <= api.SyntaxKind.LastStatement) ||
    api.isFunctionDeclaration(node) ||
    api.isClassDeclaration(node) ||
    api.isInterfaceDeclaration(node) ||
    api.isTypeAliasDeclaration(node) ||
    api.isEnumDeclaration(node) ||
    api.isModuleDeclaration(node) ||
    api.isImportDeclaration(node) ||
    api.isImportEqualsDeclaration(node) ||
    api.isExportDeclaration(node) ||
    api.isExportAssignment(node) ||
    api.isClassElement(node) ||
    api.isTypeElement(node);

  // Each compiler node is converted once, children first, so a parent finds its parts already converted.
  const converted = new Map<ts.Node, Node>();
  const origin = new WeakMap<Node, ts.Node>();

  const convert = (node: ts.Node, sourceFile: ts.SourceFile): Node => {
    const children: Mut<Node[]> = [];
    api.forEachChild(node, (child) => {
      children.push(convert(child, sourceFile));
    });
    const part = (child: ts.Node): Node => converted.get(child) ?? convert(child, sourceFile);
    /** The expression inside its parentheses and non-null assertions: `(a)!.b` is about `a`. */
    const unwrapped = (expression: ts.Expression): ts.Expression => {
      let inner = expression;
      while (api.isParenthesizedExpression(inner) || api.isNonNullExpression(inner)) inner = inner.expression;
      return inner;
    };
    const base = { start: node.getStart(sourceFile), end: node.getEnd(), children, isUnit: isUnit(node) };

    const shape = (): Node => {
      if (node.kind === api.SyntaxKind.AnyKeyword) return { ...base, kind: 'any-keyword' };
      if (node.kind === api.SyntaxKind.NullKeyword) return { ...base, kind: 'null-keyword' };
      if (node.kind === api.SyntaxKind.ImportKeyword) return { ...base, kind: 'import-keyword' };
      if (api.canHaveModifiers(node) && (api.getModifiers(node) ?? []).some((m) => m.kind === api.SyntaxKind.DeclareKeyword)) {
        return { ...base, kind: 'ambient-declaration' };
      }
      if ((api.isVariableDeclaration(node) || api.isPropertyDeclaration(node)) && node.exclamationToken !== undefined) {
        return { ...base, kind: 'definite-assignment' };
      }
      if (api.isArrayTypeNode(node) || api.isTupleTypeNode(node)) {
        const owner = node.parent;
        const isReadonly = api.isTypeOperatorNode(owner) && owner.operator === api.SyntaxKind.ReadonlyKeyword;
        return { ...base, kind: 'array-type', isReadonly };
      }
      if (api.isTypeReferenceNode(node)) {
        const named = node.typeName;
        return { ...base, kind: 'type-reference', name: api.isIdentifier(named) ? named.text : named.right.text };
      }
      const declaresProperty =
        api.isPropertySignature(node) ||
        api.isPropertyDeclaration(node) ||
        api.isIndexSignatureDeclaration(node) ||
        (api.isParameter(node) && api.isParameterPropertyDeclaration(node, node.parent));
      if (declaresProperty) {
        const modifiers = api.canHaveModifiers(node) ? (api.getModifiers(node) ?? []) : [];
        const written = node.type;
        return {
          ...base,
          kind: 'property',
          name: node.name === undefined ? '[index]' : node.name.getText(sourceFile),
          isReadonly: modifiers.some((modifier) => modifier.kind === api.SyntaxKind.ReadonlyKeyword),
          asksForMutation:
            written !== undefined && api.isTypeReferenceNode(written) && api.isIdentifier(written.typeName) && written.typeName.text === 'Mut',
        };
      }
      if (api.isTypePredicateNode(node)) return { ...base, kind: 'type-predicate', asserts: node.assertsModifier !== undefined };
      if (api.isIdentifier(node)) {
        return {
          ...base,
          kind: 'identifier',
          text: node.text,
          // Asked of few identifiers, and it needs the checker: computed on demand.
          get parameter() {
            const declaration = checker.getSymbolAtLocation(node)?.valueDeclaration;
            let owner: ts.Node | undefined = declaration;
            while (owner !== undefined && (api.isBindingElement(owner) || api.isObjectBindingPattern(owner) || api.isArrayBindingPattern(owner))) {
              owner = owner.parent;
            }
            if (owner === undefined || !api.isParameter(owner)) return 'none';
            const written = owner.type;
            const asksForMutation =
              written !== undefined && api.isTypeReferenceNode(written) && api.isIdentifier(written.typeName) && written.typeName.text === 'Mut';
            return asksForMutation ? 'mutable' : 'readonly';
          },
          get declaredOutside() {
            const parent: ts.Node & { readonly name?: ts.Node } = node.parent;
            // `ns` in the type `ns.Member` names a namespace, not a value.
            let outermost: ts.Node = node;
            while (api.isQualifiedName(outermost.parent)) outermost = outermost.parent;
            if (parent.name === node || api.isPartOfTypeNode(outermost) || api.isImportTypeNode(outermost.parent)) return false;
            const named = checker.getSymbolAtLocation(node);
            // An import is declared here, but what it names is declared where it comes from.
            const symbol = named !== undefined && (named.flags & api.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(named) : named;
            const declarations = symbol?.getDeclarations() ?? [];
            return declarations.length > 0 && declarations.every((declaration) => !isChecked(declaration.getSourceFile()));
          },
        };
      }
      if (api.isStringLiteralLike(node)) return { ...base, kind: 'string-literal', text: node.text };
      if (api.isCallExpression(node)) {
        return { ...base, kind: 'call', callee: part(node.expression), arguments: node.arguments.map(part) };
      }
      if (api.isNewExpression(node)) {
        return { ...base, kind: 'new', callee: part(unwrapped(node.expression)), argumentCount: node.arguments?.length ?? 0 };
      }
      if (api.isVariableStatement(node) && api.isSourceFile(node.parent) && (node.declarationList.flags & api.NodeFlags.Const) === 0) {
        const ambient = (api.getModifiers(node) ?? []).some((modifier) => modifier.kind === api.SyntaxKind.DeclareKeyword);
        if (!ambient) return { ...base, kind: 'module-state' };
      }
      if (api.isPropertyAccessExpression(node)) {
        return { ...base, kind: 'property-access', object: part(unwrapped(node.expression)), name: node.name.text };
      }
      if (api.isElementAccessExpression(node)) return { ...base, kind: 'element-access', object: part(unwrapped(node.expression)) };
      if (api.isPrefixUnaryExpression(node) || api.isPostfixUnaryExpression(node)) {
        const updates = node.operator === api.SyntaxKind.PlusPlusToken || node.operator === api.SyntaxKind.MinusMinusToken;
        if (updates) return { ...base, kind: 'update', operand: part(unwrapped(node.operand)) };
      }
      if (api.isDeleteExpression(node)) return { ...base, kind: 'delete', operand: part(unwrapped(node.expression)) };
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
        return { ...base, kind: 'binary', operator: api.tokenToString(node.operatorToken.kind) ?? '', left: part(unwrapped(node.left)) };
      }
      if (api.isThrowStatement(node)) return { ...base, kind: 'throw' };
      if (api.isTryStatement(node)) return { ...base, kind: 'try', block: part(node.tryBlock), hasCatch: node.catchClause !== undefined };
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
    .filter((sourceFile) => isChecked(sourceFile) && (options.only?.(sourceFile.fileName) ?? true))
    .map((sourceFile): SourceFile => {
      const file = { name: displayName(sourceFile.fileName), text: sourceFile.text, root: convert(sourceFile, sourceFile) };
      sources.set(file, sourceFile);
      return file;
    });

  const declarationFiles = program
    .getSourceFiles()
    .filter(
      (sourceFile) =>
        sourceFile.isDeclarationFile &&
        !program.isSourceFileFromExternalLibrary(sourceFile) &&
        !program.isSourceFileDefaultLibrary(sourceFile) &&
        !sourceFile.fileName.includes('/node_modules/') &&
        sourceFile.fileName.startsWith(root),
    )
    .map((sourceFile) => displayName(sourceFile.fileName));

  const locators = new Map<ts.SourceFile, (offset: number) => Position>();
  const locatorOf = (sourceFile: ts.SourceFile): ((offset: number) => Position) => {
    const known = locators.get(sourceFile);
    if (known !== undefined) return known;
    const created = locator(sourceFile.text);
    locators.set(sourceFile, created);
    return created;
  };

  // Restricted to some files, the compiler is asked about those and about everything the rules do not read
  // (dependencies, declaration files, the options): the same errors as a whole run, minus the files left out.
  const partial = (only: (fileName: string) => boolean): readonly ts.Diagnostic[] => {
    const compilerOptions = program.getCompilerOptions();
    const declarations = compilerOptions.declaration === true || compilerOptions.composite === true;
    const perFile = program
      .getSourceFiles()
      .filter((sourceFile) => !isChecked(sourceFile) || only(sourceFile.fileName))
      .flatMap((sourceFile) => [
        ...program.getSyntacticDiagnostics(sourceFile),
        ...program.getSemanticDiagnostics(sourceFile),
        ...(declarations ? program.getDeclarationDiagnostics(sourceFile) : []),
      ]);
    return api.sortAndDeduplicateDiagnostics([
      ...program.getConfigFileParsingDiagnostics(),
      ...program.getOptionsDiagnostics(),
      ...program.getGlobalDiagnostics(),
      ...perFile,
    ]);
  };
  const reported =
    options.compilerDiagnostics === false ? [] : options.only === undefined ? api.getPreEmitDiagnostics(program) : partial(options.only);
  const compilerDiagnostics = reported.map((diagnostic): Diagnostic => {
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
    declarationFiles,
    compilerOptions: program.getCompilerOptions(),
    compilerDiagnostics,
    typeOf: (node) => {
      const source = origin.get(node);
      return source === undefined ? unknownOrigin : wrapType(checker.getTypeAtLocation(source));
    },
    calleeOf: (node) => {
      const source = origin.get(node);
      if (source === undefined || !(api.isCallExpression(source) || api.isNewExpression(source))) return undefined;
      const declaration = checker.getResolvedSignature(source)?.declaration;
      if (declaration === undefined || api.isJSDocSignature(declaration)) return undefined;
      const constructs = api.isConstructSignatureDeclaration(declaration) || api.isConstructorDeclaration(declaration);
      const member = constructs ? 'new' : (declaration.name?.getText() ?? '');
      // `var URL: { new (…): URL }` and `interface Date { toISOString(): string }` both give `Owner.member`.
      const holder = api.isTypeLiteralNode(declaration.parent) ? declaration.parent.parent : declaration.parent;
      const owner =
        api.isInterfaceDeclaration(holder) || api.isClassDeclaration(holder) || api.isVariableDeclaration(holder) ? holder.name?.getText() : undefined;
      const file = declaration.getSourceFile();
      const fromPath = /.*\/node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(file.fileName)?.[1];
      return {
        name: owner === undefined ? member : `${owner}.${member}`,
        origin: isChecked(file)
          ? { kind: 'project' }
          : program.isSourceFileDefaultLibrary(file)
            ? { kind: 'library' }
            : { kind: 'package', package: options.packageNameOf?.(file.fileName) ?? fromPath },
      };
    },
    exportsOf: (file) => {
      const sourceFile = sources.get(file);
      const module = sourceFile === undefined ? undefined : checker.getSymbolAtLocation(sourceFile);
      if (sourceFile === undefined || module === undefined) return [];
      const exported: Mut<ExportedValue[]> = [];
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

/** The project's own source files: what the rules read, by absolute path. For hosts that cache per file. */
export function checkedFileNames(program: ts.Program, rootDir: string): readonly string[] {
  const root = `${rootDir.replaceAll('\\', '/').replace(/\/+$/, '')}/`;
  return program
    .getSourceFiles()
    .filter(
      (sourceFile) =>
        !sourceFile.isDeclarationFile &&
        !program.isSourceFileFromExternalLibrary(sourceFile) &&
        !sourceFile.fileName.includes('/node_modules/') &&
        sourceFile.fileName.startsWith(root),
    )
    .map((sourceFile) => sourceFile.fileName);
}
