// The TypeProvider of the TypeScript 6 API, and the only place in core that knows a compiler. The compiler itself is
// passed in by the caller (the CLI imports it, the playground loads it in the page), so core imports its types only.
import type ts from '@typescript/typescript6';
import { type Diagnostic, diagnosticAt, locator, type Position } from '../diagnostic.js';
import type { Mut } from '../mut.js';
import { pattern, wholeNumber } from '../unsafe/run.js';
import { record } from '../record.js';
import type { Callee, ExportedValue, SourceFile, Type, TypeProvider } from '../provider.js';
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
  /**
   * The sources of the project the compiler does not read (single-file components), by absolute path, for a host
   * that can list a directory. They are refused as such, and an import of one is not refused for another reason.
   */
  readonly unreadSources?: readonly string[];
}

/** The extensions of the sources that hold code and that the compiler does not read. */
export const UNREAD_EXTENSIONS: readonly string[] = ['.vue', '.svelte', '.astro'];

export function createTypeScript6Provider(
  api: typeof ts,
  program: ts.Program,
  options: TypeScript6Options,
): TypeProvider {
  const checker = program.getTypeChecker();
  const root = `${options.rootDir.replace(/\\/g, '/').replace(/\/+$/, '')}/`;
  const displayName = (fileName: string): string => (fileName.startsWith(root) ? fileName.slice(root.length) : fileName);

  const literal =
    api.TypeFlags.StringLiteral |
    api.TypeFlags.NumberLiteral |
    api.TypeFlags.BooleanLiteral |
    api.TypeFlags.EnumLiteral |
    api.TypeFlags.Undefined;

  const primitiveKinds: readonly (readonly [number, string])[] = [
    [api.TypeFlags.StringLike, 'string'],
    [api.TypeFlags.NumberLike, 'number'],
    [api.TypeFlags.BigIntLike, 'bigint'],
    [api.TypeFlags.BooleanLike, 'boolean'],
    [api.TypeFlags.ESSymbolLike, 'symbol'],
    [api.TypeFlags.Undefined | api.TypeFlags.Void, 'undefined'],
    [api.TypeFlags.Null, 'null'],
  ];
  const isPlainKind = (kind: string): boolean => kind !== 'object' && kind !== 'symbol' && !/^[A-Z]/.test(kind);
  /** The kinds of value a type admits: see `Type.kinds`. */
  const kindsOf = (written: ts.Type, depth: number): readonly string[] => {
    // A type that waits for another (a type parameter, `keyof T`, `T[K]`) admits what its constraint admits.
    const type = (written.flags & api.TypeFlags.Instantiable) === 0 ? written : (checker.getBaseConstraintOfType(written) ?? written);
    const primitive = primitiveKinds.find(([flags]) => (type.flags & flags) !== 0);
    if (primitive !== undefined) return [primitive[1]];
    if (depth > 4) return ['object'];
    if (type.isUnion()) return [...new Set(type.types.flatMap((member) => kindsOf(member, depth + 1)))];
    if (type.isIntersection()) {
      // A brand on a primitive: the value is the primitive.
      const branded = type.types.flatMap((member) => kindsOf(member, depth + 1)).find((kind) => isPlainKind(kind) && kind !== 'array');
      return [branded ?? 'object'];
    }
    if (checker.isArrayType(type) || checker.isTupleType(type)) {
      // What an index gives: the item type of an array, the union of the item types of a tuple.
      const item = checker.getIndexTypeOfType(type, api.IndexKind.Number);
      return [item !== undefined && kindsOf(item, depth + 1).every(isPlainKind) ? 'array' : 'object'];
    }
    const symbol = type.getSymbol();
    const declarations = symbol?.getDeclarations() ?? [];
    const fromLibrary = declarations.length > 0 && declarations.every((declaration) => program.isSourceFileDefaultLibrary(declaration.getSourceFile()));
    const name = symbol?.getName();
    return [fromLibrary && name !== undefined && /^[A-Z]\w*$/.test(name) ? name : 'object'];
  };

  const isMut = (written: ts.TypeNode | undefined): boolean =>
    written !== undefined && api.isTypeReferenceNode(written) && api.isIdentifier(written.typeName) && written.typeName.text === 'Mut';

  /** Whether a property cannot be written: declared `readonly`, or made so by a mapped type (`Readonly<T>`). */
  const isReadonlySymbol = (symbol: ts.Symbol): boolean => {
    const declared = (symbol.getDeclarations() ?? []).some(
      (declaration) => api.canHaveModifiers(declaration) && (api.getModifiers(declaration) ?? []).some((modifier) => modifier.kind === api.SyntaxKind.ReadonlyKeyword),
    );
    if (declared) return true;
    // A property a mapped type made carries its `readonly` in a flag the compiler keeps on the symbol, and gives no
    // function to read. Read where it is; a test says what happens the day it moves.
    const READONLY = 8;
    return 'links' in symbol && typeof symbol.links === 'object' && symbol.links !== null && 'checkFlags' in symbol.links && typeof symbol.links.checkFlags === 'number' && (symbol.links.checkFlags & READONLY) !== 0;
  };

  const MOST = 16;
  /** Each way to pick one value from each list, or nothing past `MOST` of them. */
  const combinations = (lists: readonly (readonly unknown[])[]): readonly (readonly unknown[])[] | undefined => {
    let all: readonly (readonly unknown[])[] = [[]];
    for (const list of lists) {
      all = all.flatMap((chosen) => list.map((value) => [...chosen, value]));
      if (all.length > MOST) return undefined;
    }
    return all;
  };
  /** The values a type is made of, when it is a literal or a union of literals. */
  const valuesOfType = (type: ts.Type): readonly unknown[] | undefined => {
    if (type.isUnion()) {
      const members = type.types.map(valuesOfType);
      const known = members.flatMap((member) => member ?? []);
      return members.some((member) => member === undefined) || known.length > MOST ? undefined : known;
    }
    if (type.isStringLiteral() || type.isNumberLiteral()) return [type.value];
    if ((type.flags & api.TypeFlags.BigIntLiteral) !== 0) {
      const made = wholeNumber(checker.typeToString(type).slice(0, -1));
      return made.ok ? [made.value] : undefined;
    }
    if ((type.flags & api.TypeFlags.BooleanLiteral) !== 0) return [checker.typeToString(type) === 'true'];
    if ((type.flags & (api.TypeFlags.Undefined | api.TypeFlags.Void)) !== 0) return [undefined];
    return undefined;
  };
  /** Every value an expression can have: see `TypeProvider.valuesOf`. */
  const valuesOf = (written: ts.Expression, depth: number): readonly unknown[] | undefined => {
    let expression = written;
    while (api.isParenthesizedExpression(expression) || api.isAsExpression(expression) || api.isSatisfiesExpression(expression)) expression = expression.expression;
    if (depth > 3) return undefined;
    if (api.isRegularExpressionLiteral(expression)) {
      const parts = /^\/(.*)\/([a-z]*)$/s.exec(expression.text);
      const made = parts === null ? undefined : pattern(parts[1] ?? '', parts[2] ?? '');
      return made?.ok === true ? [made.value] : undefined;
    }
    if (api.isArrayLiteralExpression(expression)) {
      const items = expression.elements.map((element) => (api.isSpreadElement(element) || api.isOmittedExpression(element) ? undefined : valuesOf(element, depth + 1)));
      const known = items.flatMap((item) => (item === undefined ? [] : [item]));
      return known.length === items.length ? combinations(known) : undefined;
    }
    if (api.isObjectLiteralExpression(expression)) {
      const names: Mut<string[]> = [];
      const lists: Mut<(readonly unknown[])[]> = [];
      for (const property of expression.properties) {
        const value = api.isPropertyAssignment(property) ? property.initializer : api.isShorthandPropertyAssignment(property) ? property.name : undefined;
        const name = property.name !== undefined && (api.isIdentifier(property.name) || api.isStringLiteral(property.name)) ? property.name.text : undefined;
        const values = value === undefined ? undefined : valuesOf(value, depth + 1);
        if (name === undefined || name === '__proto__' || values === undefined) return undefined;
        names.push(name);
        lists.push(values);
      }
      return combinations(lists)?.map((chosen) => record(names.map((name, index): readonly [string, unknown] => [name, chosen[index]])));
    }
    return valuesOfType(checker.getTypeAtLocation(expression));
  };

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
      get isOnce() {
        // The mark is an object type intersected with the value's own: only an intersection can carry it, and only
        // its small parts need be asked.
        const members = type.isUnion() ? type.types : [type];
        return members.some((member) => member.isIntersection() && member.types.some((part) => (part.flags & api.TypeFlags.Object) !== 0 && part.getProperty('__once') !== undefined));
      },
      get isPlain() {
        return kindsOf(type, 0).every(isPlainKind);
      },
      get kinds() {
        return kindsOf(type, 0);
      },
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
      get propertyNames() {
        return type.getProperties().map((symbol) => symbol.getName());
      },
      get readonlyProperties() {
        return type.getProperties().filter(isReadonlySymbol).map((symbol) => symbol.getName());
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

  const readCallee = calleeReader(api, program, options.rootDir, options.packageNameOf);

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
  const origin = new Map<Node, ts.Node>();

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
          get declaredAt() {
            const owner = node.parent;
            const symbol = api.isShorthandPropertyAssignment(owner) ? checker.getShorthandAssignmentValueSymbol(owner) : checker.getSymbolAtLocation(node);
            const declaration = symbol?.valueDeclaration;
            const declares = declaration !== undefined && (api.isVariableDeclaration(declaration) || api.isParameter(declaration));
            return declares && declaration.getSourceFile() === sourceFile ? declaration.getStart(sourceFile) : undefined;
          },
          get declaredOutside() {
            const parent: ts.Node & { readonly name?: ts.Node } = node.parent;
            // `ns` in the type `ns.Member` names a namespace, not a value.
            let outermost: ts.Node = node;
            while (api.isQualifiedName(outermost.parent)) outermost = outermost.parent;
            if (parent.name === node || api.isPartOfTypeNode(outermost) || api.isImportTypeNode(outermost.parent)) return false;
            // `div` in `<div>` names an element of the page, not a value: what a framework types its elements as is
            // not something this name brought in.
            if ((api.isJsxOpeningLikeElement(parent) || api.isJsxClosingElement(parent)) && parent.tagName === node && /^[a-z]/.test(node.text)) return false;
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
      if (api.isTaggedTemplateExpression(node)) {
        const template = node.template;
        const substitutions = api.isTemplateExpression(template) ? template.templateSpans.map((span) => part(span.expression)) : [];
        return { ...base, kind: 'call', callee: part(node.tag), arguments: [part(template), ...substitutions] };
      }
      if (api.isTemplateExpression(node) && !api.isTaggedTemplateExpression(node.parent)) {
        return { ...base, kind: 'template', parts: node.templateSpans.map((span) => part(span.expression)) };
      }
      if (api.isNewExpression(node)) {
        return { ...base, kind: 'new', callee: part(unwrapped(node.expression)), argumentCount: node.arguments?.length ?? 0, arguments: (node.arguments ?? []).map(part) };
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
        return { ...base, kind: 'unary', operator: api.tokenToString(node.operator) ?? '', operand: part(unwrapped(node.operand)) };
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
        return { ...base, kind: 'binary', operator: api.tokenToString(node.operatorToken.kind) ?? '', left: part(unwrapped(node.left)), right: part(unwrapped(node.right)) };
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
      if (api.isObjectLiteralExpression(node) || api.isArrayLiteralExpression(node)) return { ...base, kind: 'literal' };
      if (api.isBlock(node) || api.isSourceFile(node) || api.isModuleBlock(node)) return { ...base, kind: 'block' };
      if (api.isVariableStatement(node) || api.isVariableDeclarationList(node) || api.isParenthesizedExpression(node)) return { ...base, kind: 'sequence' };
      if (api.isVariableDeclaration(node)) {
        const list = node.parent;
        const isConst = api.isVariableDeclarationList(list) && (list.flags & api.NodeFlags.Const) !== 0;
        return { ...base, kind: 'variable', name: part(node.name), isConst, initializer: node.initializer === undefined ? undefined : part(node.initializer) };
      }
      if (api.isMethodSignature(node)) return { ...base, kind: 'method-signature' };
      if (api.isEnumDeclaration(node)) {
        const isText = (member: ts.EnumMember): boolean => member.initializer !== undefined && api.isStringLiteralLike(member.initializer);
        return { ...base, kind: 'enum', isNumeric: !node.members.every(isText) };
      }
      if (api.isFunctionLike(node) && !api.isTypeNode(node) && !api.isTypeElement(node)) {
        const body = 'body' in node ? node.body : undefined;
        const declares = api.isFunctionDeclaration(node) || api.isMethodDeclaration(node) || api.isConstructorDeclaration(node);
        const isAbstract = (api.getCombinedModifierFlags(node) & api.ModifierFlags.Abstract) !== 0;
        // Under `declare`, a signature with no body says what is defined elsewhere: `no-ambient` answers for it.
        const isDeclared =
          api.findAncestor(node, (outer) => api.canHaveModifiers(outer) && (api.getModifiers(outer) ?? []).some((modifier) => modifier.kind === api.SyntaxKind.DeclareKeyword)) !== undefined;
        const isOverload = declares && body === undefined && !isAbstract && !isDeclared;
        return { ...base, kind: 'function', parameters: node.parameters.map((parameter) => part(parameter.name)), body: body === undefined ? undefined : part(body), isOverload };
      }
      if (api.isIfStatement(node)) {
        return { ...base, kind: 'if', condition: part(node.expression), whenTrue: part(node.thenStatement), whenFalse: node.elseStatement === undefined ? undefined : part(node.elseStatement) };
      }
      if (api.isReturnStatement(node)) return { ...base, kind: 'return', expression: node.expression === undefined ? undefined : part(node.expression) };
      return { ...base, kind: 'other' };
    };

    const result = shape();
    converted.set(node, result);
    origin.set(result, node);
    return result;
  };

  const sources = new Map<SourceFile, ts.SourceFile>();
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
  // The unread sources, and how a specifier names one: by a path from the file that imports it, or by an alias of
  // `paths`, which is resolved here since the compiler does not look for a file it cannot read.
  const slashed = (fileName: string): string => fileName.replace(/\\/g, '/');
  const unread = new Set((options.unreadSources ?? []).map(slashed));
  const joined = (directory: string, path: string): string => {
    const parts: Mut<string[]> = [];
    for (const part of (path.startsWith('/') ? path : `${directory}/${path}`).split('/')) {
      if (part === '..') parts.pop();
      else if (part !== '.' && part !== '') parts.push(part);
    }
    return `/${parts.join('/')}`;
  };
  const compilerOptions = program.getCompilerOptions();
  const base = compilerOptions.baseUrl ?? compilerOptions['pathsBasePath'];
  const aliased = (text: string): readonly string[] =>
    Object.entries(compilerOptions.paths ?? {}).flatMap(([pattern, targets]) => {
      const star = pattern.indexOf('*');
      const matched =
        star === -1
          ? pattern === text
            ? ''
            : undefined
          : text.length >= pattern.length - 1 && text.startsWith(pattern.slice(0, star)) && text.endsWith(pattern.slice(star + 1))
            ? text.slice(star, text.length - (pattern.length - star - 1))
            : undefined;
      return matched === undefined ? [] : targets.map((target) => joined(typeof base === 'string' ? slashed(base) : root, target.replace('*', matched)));
    });
  const namesUnread = (specifier: ts.Node): boolean => {
    if (unread.size === 0 || !api.isStringLiteralLike(specifier)) return false;
    const text = specifier.text;
    const from = slashed(specifier.getSourceFile().fileName);
    const candidates = text.startsWith('.') ? [joined(from.slice(0, from.lastIndexOf('/')), text)] : aliased(text);
    return candidates.some((candidate) => unread.has(candidate));
  };
  /** « Cannot find module »: for an unread source that is no news, it is refused as one. */
  const CANNOT_FIND_MODULE = 2307;
  const aboutUnread = (diagnostic: ts.Diagnostic): boolean => {
    if (diagnostic.code !== CANNOT_FIND_MODULE || diagnostic.file === undefined || diagnostic.start === undefined) return false;
    const at = diagnostic.start;
    const within = (node: ts.Node): ts.Node => api.forEachChild(node, (child) => (child.pos <= at && at < child.end ? within(child) : undefined)) ?? node;
    return namesUnread(within(diagnostic.file));
  };

  const reported = (
    options.compilerDiagnostics === false ? [] : options.only === undefined ? api.getPreEmitDiagnostics(program) : partial(options.only)
  ).filter((diagnostic) => !aboutUnread(diagnostic));
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
    isOnce: false,
    readonlyProperties: [],
    propertyNames: [],
    isPlain: false,
    kinds: ['object'],
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
    unreadSources: [...unread].map(displayName).toSorted(),
    compilerOptions: program.getCompilerOptions(),
    compilerDiagnostics,
    typeOf: (node) => {
      const source = origin.get(node);
      return source === undefined ? unknownOrigin : wrapType(checker.getTypeAtLocation(source));
    },
    isOwnModule: (node) => {
      const source = origin.get(node);
      if (source === undefined || !api.isStringLiteralLike(source)) return false;
      const modules = checker.getSymbolAtLocation(source)?.declarations ?? [];
      // Only a source the rules read: a declaration file, even one the project keeps, says what a dependency is,
      // and a module declared by its name (`declare module "x"`) is no file at all.
      return modules.length > 0 && modules.every((module) => api.isSourceFile(module) && isChecked(module));
    },
    isUnreadSource: (node) => {
      const source = origin.get(node);
      return source !== undefined && namesUnread(source);
    },
    calleeOf: (node) => {
      const source = origin.get(node);
      const calls = source !== undefined && (api.isCallExpression(source) || api.isNewExpression(source) || api.isTaggedTemplateExpression(source));
      return calls ? readCallee(source) : undefined;
    },
    expectedOf: (node) => {
      const source = origin.get(node);
      if (source === undefined || !api.isExpression(source)) return undefined;
      const expected = checker.getContextualType(source);
      return expected === undefined ? undefined : wrapType(expected);
    },
    valuesOf: (node) => {
      const source = origin.get(node);
      return source === undefined || !api.isExpression(source) ? undefined : valuesOf(source, 0);
    },
    asksForMutation: (node) => {
      const source = origin.get(node);
      if (source === undefined || !api.isExpression(source)) return false;
      let place: ts.Node = source;
      while (api.isParenthesizedExpression(place.parent)) place = place.parent;
      const holder = place.parent;
      if (api.isVariableDeclaration(holder)) return holder.initializer === place && isMut(holder.type);
      if (api.isReturnStatement(holder) || (api.isArrowFunction(holder) && holder.body === place)) {
        let owner: ts.Node | undefined = holder;
        while (owner !== undefined && !api.isFunctionLike(owner)) owner = owner.parent;
        return owner !== undefined && api.isFunctionLike(owner) && isMut(owner.type);
      }
      if (api.isCallExpression(holder) || api.isNewExpression(holder)) {
        const index = (holder.arguments ?? []).findIndex((argument) => argument === place);
        if (index === -1) return false;
        const parameters = checker.getResolvedSignature(holder)?.getParameters() ?? [];
        // Past the last one, an argument goes to the rest of them.
        const declaration = (parameters[index] ?? parameters.at(-1))?.valueDeclaration;
        return declaration !== undefined && api.isParameter(declaration) && isMut(declaration.type);
      }
      return false;
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
  const root = `${rootDir.replace(/\\/g, '/').replace(/\/+$/, '')}/`;
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

/**
 * Reads where the function a call or a `new` reaches is declared. For hosts that work on the compiler's own nodes
 * (an instrumenter), with the same answer the rules get.
 */
export function calleeReader(
  api: typeof ts,
  program: ts.Program,
  rootDir: string,
  packageNameOf?: (fileName: string) => string | undefined,
): (call: ts.CallExpression | ts.NewExpression | ts.TaggedTemplateExpression) => Callee | undefined {
  const checker = program.getTypeChecker();
  const checked = new Set(checkedFileNames(program, rootDir));
  const packageOf = (fileName: string): string | undefined =>
    packageNameOf?.(fileName) ?? /.*\/node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(fileName)?.[1];
  /**
   * The package a call's name is imported from: for `name(…)`, for `all.name(…)` after `import * as all`, and for a
   * global that a framework declares as `const name: typeof import('vue').name`.
   */
  const importedFrom = (called: ts.Expression): string | undefined => {
    const head = api.isPropertyAccessExpression(called) ? called.expression : called;
    if (!api.isIdentifier(head)) return undefined;
    const binding = checker.getSymbolAtLocation(head)?.declarations?.[0];
    if (binding === undefined || (head !== called && !api.isNamespaceImport(binding))) return undefined;
    const declared = api.isVariableDeclaration(binding) ? binding.type : undefined;
    const specifier =
      declared !== undefined && api.isImportTypeNode(declared) && declared.isTypeOf && api.isLiteralTypeNode(declared.argument)
        ? declared.argument.literal
        : api.findAncestor(binding, api.isImportDeclaration)?.moduleSpecifier;
    const module = specifier === undefined ? undefined : checker.getSymbolAtLocation(specifier)?.declarations?.[0];
    // Only a module found in a dependency says which package it is: a path of the project names none.
    return module !== undefined && api.isSourceFile(module) && module.fileName.includes('/node_modules/') ? packageOf(module.fileName) : undefined;
  };
  return (call) => {
    const declaration = checker.getResolvedSignature(call)?.declaration;
    if (declaration === undefined || api.isJSDocSignature(declaration)) return undefined;
    const constructs = api.isConstructSignatureDeclaration(declaration) || api.isConstructorDeclaration(declaration);
    const member = constructs ? 'new' : (declaration.name?.getText() ?? '');
    // `var URL: { new (…): URL }` and `interface Date { toISOString(): string }` both give `Owner.member`.
    const holder = api.isTypeLiteralNode(declaration.parent) ? declaration.parent.parent : declaration.parent;
    // A function of a namespace (`Reflect.get`) is named by it too; one of a module declared by its path is not.
    const named = api.isModuleBlock(holder) && api.isIdentifier(holder.parent.name) ? holder.parent : holder;
    const owner =
      api.isInterfaceDeclaration(named) || api.isClassDeclaration(named) || api.isVariableDeclaration(named) || api.isModuleDeclaration(named)
        ? named.name?.getText()
        : undefined;
    const file = declaration.getSourceFile();
    const origin: Callee['origin'] = checked.has(file.fileName)
      ? { kind: 'project' }
      : program.isSourceFileDefaultLibrary(file)
        ? { kind: 'library' }
        : { kind: 'package', package: packageOf(file.fileName) };
    const through = origin.kind === 'package' ? importedFrom(api.isTaggedTemplateExpression(call) ? call.tag : call.expression) : undefined;
    return {
      name: owner === undefined ? member : `${owner}.${member}`,
      origin,
      ...(through === undefined ? {} : { importedFrom: through }),
    };
  };
}
