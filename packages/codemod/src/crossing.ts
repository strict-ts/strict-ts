// Where a `null` that became `undefined` would be told apart from what it was. The compiler does not say: a value
// given to `JSON.stringify`, to a parameter typed `unknown`, to a template, compiles as before and does something
// else. The types of the project before and after the fixes are compared at every place where a value is handed
// on: a fix may change the type of a value only where the type of the place that receives it changes with it.
import type { Mut } from '@strict-ts/std';
import type ts from '@typescript/typescript6';
import { typeArgumentsOf } from './unsafe/types.js';

/** One place where the fixes that were tried change what leaves the types that follow them. */
export interface Crossing {
  readonly file: string;
  /** In the text as fixed. */
  readonly start: number;
  readonly length: number;
  /** The same text for the same place from one trial to the next. */
  readonly where: string;
}

/** A strict comparison with `null` whose other side became `undefined`: the place of its `null`, as first written. */
export interface Compared {
  readonly file: string;
  readonly start: number;
  readonly end: number;
}

/** How much of a type is read before the rest is taken as it is named. */
const BUDGET = 600;
/** How deep: a type that makes a new one at each step never comes back to itself. */
const DEPTH = 10;

/** Gives the same number to the same text: the shape of a type, compared from one compilation to another. */
export interface Names {
  /** `parts` are the numbers of what the text is made of; `isNull` for the text of `null` itself. */
  readonly of: (text: string, parts?: readonly number[], isNull?: boolean) => number;
  /** Whether what has this number holds a `null` somewhere, or was not read to the end. */
  readonly holdsNull: (name: number) => boolean;
}
export function names(): Names {
  const known: Mut<Map<string, number>> = new Map();
  const holding: Mut<Set<number>> = new Set();
  return {
    of: (text, parts = [], isNull = false) => {
      const found = known.get(text);
      if (found !== undefined) return found;
      const made = known.size;
      known.set(text, made);
      if (isNull || parts.some((part) => holding.has(part))) holding.add(made);
      return made;
    },
    holdsNull: (name) => holding.has(name),
  };
}

interface Reader {
  /** The shape of a type, read through the types the project declares. */
  readonly shape: (type: ts.Type) => number;
  /** Whether `null`, and whether `undefined`, is one of the values of the type by itself. */
  readonly top: (type: ts.Type) => string;
}

function reader(api: typeof ts, program: ts.Program, checker: ts.TypeChecker, named: Names): Reader {
  const members = (type: ts.Type): readonly ts.Type[] => (type.isUnion() ? type.types : [type]);
  const has = (type: ts.Type, flags: number): boolean => members(type).some((member) => (member.flags & flags) !== 0);
  /** Declared by a library or a package, under a name: its members cannot change with a fix, only its arguments. */
  const isOutside = (symbol: ts.Symbol): boolean => {
    const declarations = symbol.getDeclarations() ?? [];
    const named = (symbol.flags & (api.SymbolFlags.Interface | api.SymbolFlags.Class | api.SymbolFlags.TypeAlias)) !== 0;
    return (
      named &&
      declarations.length > 0 &&
      declarations.every((declaration) => {
        const file = declaration.getSourceFile();
        return program.isSourceFileDefaultLibrary(file) || program.isSourceFileFromExternalLibrary(file) || file.fileName.includes('/node_modules/');
      })
    );
  };
  const known: Mut<Map<ts.Type, number>> = new Map();
  let left = BUDGET;
  const read = (type: ts.Type, path: readonly ts.Type[]): number => {
    const simple = api.TypeFlags.Object | api.TypeFlags.Union | api.TypeFlags.Intersection;
    if ((type.flags & simple) === 0) return named.of(`${type.flags} ${checker.typeToString(type)}`, [], (type.flags & api.TypeFlags.Null) !== 0);
    // A type that holds itself, or one too large to read: taken by its name from here, and for one that may hold
    // a `null`.
    if (path.includes(type) || path.length >= DEPTH || left <= 0) return named.of(`… ${checker.typeToString(type)}`, [], true);
    left -= 1;
    const under = [...path, type];
    const parts: Mut<number[]> = [];
    const part = (inner: ts.Type): number => {
      const made = read(inner, under);
      parts.push(made);
      return made;
    };
    const each = (types: readonly ts.Type[]): string => types.map(part).join(',');
    const text = (): string => {
      if (type.isUnion()) return `| ${members(type).map(part).toSorted((a, b) => a - b).join(',')}`;
      if (type.isIntersection()) return `& ${each(type.types)}`;
      const given = typeArgumentsOf(api, checker, type).unwrapOr([]);
      const aliased = type.aliasTypeArguments ?? [];
      const symbol = type.aliasSymbol ?? type.getSymbol();
      if (symbol !== undefined && isOutside(symbol)) return `out ${symbol.getName()} <${each(given)}> <${each(aliased)}>`;
      const properties = checker.getPropertiesOfType(type).map((property) => `${property.getName()}${(property.flags & api.SymbolFlags.Optional) === 0 ? '' : '?'}:${part(checker.getTypeOfSymbol(property))}`);
      const signatures = [...type.getCallSignatures(), ...type.getConstructSignatures()].map(
        (signature) => `(${each(signature.getParameters().map((parameter) => checker.getTypeOfSymbol(parameter)))})=>${part(signature.getReturnType())}`,
      );
      const indexed = checker.getIndexInfosOfType(type).map((info) => `[${part(info.keyType)}]:${part(info.type)}`);
      return `{ ${properties.join(';')} } ${signatures.join(';')} ${indexed.join(';')} <${each(given)}>`;
    };
    const written = text();
    return named.of(written, parts);
  };
  return {
    // Each reading starts again from the type it is asked, with the whole budget: what is read of a type under
    // another depends on what was read before it, and two compilations must read alike.
    shape: (type) => {
      const before = known.get(type);
      if (before !== undefined) return before;
      left = BUDGET;
      const made = read(type, []);
      known.set(type, made);
      return made;
    },
    top: (type) => `${has(type, api.TypeFlags.Null) ? 'null' : ''} ${has(type, api.TypeFlags.Undefined | api.TypeFlags.Void) ? 'undefined' : ''}`,
  };
}

/** What a place says of itself in one compilation. Two compilations are compared member by member. */
interface Seen {
  /** The shape of the value, and of what the place it is given to expects, when it expects something. */
  readonly value: number;
  readonly expected: number | undefined;
  /** For an argument of a call that chooses its own type arguments: the shape of what the call gives back. */
  readonly returned: number | undefined;
  readonly top: string;
  readonly isAny: boolean;
  /** What is expected is a type the function leaves open: whatever is given, the type follows. */
  readonly isOpen: boolean;
  /** Given to the assertion of a test. */
  readonly isChecked: boolean;
  /** A `null` is held somewhere in what the place gives or expects: only such a place can change with a fix. */
  readonly holdsNull: boolean;
}

/** How a place can tell `null` from `undefined`. */
type Kind = 'given' | 'asserted' | 'printed' | 'compared-null' | 'compared-undefined';

interface Place {
  readonly kind: Kind;
  readonly node: ts.Expression;
  /** The `null` of a comparison with it. */
  readonly other: ts.Node | undefined;
}

/** A program with what is read from it. */
export interface Side {
  readonly program: ts.Program;
  readonly checker: ts.TypeChecker;
}

/** The hooks of React whose last argument is a list compared with `Object.is`, element by element. */
const HOOKS: readonly string[] = ['useEffect', 'useLayoutEffect', 'useInsertionEffect', 'useMemo', 'useCallback', 'useImperativeHandle'];

const EQUALITIES = (api: typeof ts): readonly ts.SyntaxKind[] => [api.SyntaxKind.EqualsEqualsEqualsToken, api.SyntaxKind.ExclamationEqualsEqualsToken];

/** The places of a file where a value is handed on, in the order they are written: the same in every compilation. */
function placesOf(api: typeof ts, sourceFile: ts.SourceFile): readonly Place[] {
  const found: Mut<Place[]> = [];
  const isUndefined = (node: ts.Node): boolean => api.isIdentifier(node) && node.text === 'undefined';
  const isNull = (node: ts.Node): boolean => node.kind === api.SyntaxKind.NullKeyword;
  /**
   * Given to something that takes `null` and `undefined` alike, or that expects nothing of it: the left of `??` and
   * of `||`, `Boolean(…)`, what a pattern takes apart, the name of a component, what is shown between two tags,
   * and the list a hook of React compares from one render to the next.
   */
  const isIndifferent = (node: ts.Expression): boolean => {
    const owner = node.parent;
    if (api.isBinaryExpression(owner) && owner.left === node) return [api.SyntaxKind.QuestionQuestionToken, api.SyntaxKind.BarBarToken].includes(owner.operatorToken.kind);
    if (api.isCallExpression(owner) && api.isIdentifier(owner.expression) && owner.arguments.includes(node)) {
      if (owner.expression.text === 'Boolean') return true;
      if (HOOKS.includes(owner.expression.text) && api.isArrayLiteralExpression(node) && owner.arguments.at(-1) === node) return true;
    }
    if (api.isArrayLiteralExpression(owner) && isIndifferent(owner) && api.isCallExpression(owner.parent)) return true;
    if ((api.isVariableDeclaration(owner) || api.isParameter(owner)) && owner.initializer === node) return owner.type === undefined && !api.isIdentifier(owner.name);
    if (api.isJsxOpeningElement(owner) || api.isJsxSelfClosingElement(owner) || api.isJsxClosingElement(owner)) return owner.tagName === node;
    return api.isJsxExpression(owner) && (api.isJsxElement(owner.parent) || api.isJsxFragment(owner.parent));
  };
  const visit = (node: ts.Node): void => {
    // A type is not a place, and what is written in one differs from a compilation to the next.
    if (api.isTypeNode(node)) return;
    if (api.isExpression(node)) {
      const owner = node.parent;
      if (api.isBinaryExpression(owner) && EQUALITIES(api).includes(owner.operatorToken.kind)) {
        const other = owner.left === node ? owner.right : owner.left;
        // What a `null` is compared with here may be `undefined` in another compilation: both are places.
        if (isNull(other) || isUndefined(other)) found.push({ kind: isNull(other) ? 'compared-null' : 'compared-undefined', node, other });
      }
      const printed = api.isTemplateSpan(owner) || api.isTypeOfExpression(owner) || (api.isBinaryExpression(owner) && owner.operatorToken.kind === api.SyntaxKind.PlusToken);
      if (printed) found.push({ kind: 'printed', node, other: undefined });
      if (api.isAsExpression(node) || api.isTypeAssertionExpression(node)) found.push({ kind: 'asserted', node, other: undefined });
      if (!isIndifferent(node)) found.push({ kind: 'given', node, other: undefined });
    }
    api.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

/**
 * Compares a project as it was with the project as some fixes would leave it. `interesting` keeps, for each file,
 * the places whose types hold a `null` in the project as it was: no other place can change.
 */
export function comparer(api: typeof ts, before: Side, named: Names) {
  const old = reader(api, before.program, before.checker, named);
  const isConsole = (node: ts.Expression): boolean => {
    const owner = node.parent;
    return api.isCallExpression(owner) && api.isPropertyAccessExpression(owner.expression) && api.isIdentifier(owner.expression.expression) && owner.expression.expression.text === 'console';
  };
  const see = (side: Side, read: Reader, place: Place): Seen => {
    const { checker } = side;
    const node = place.node;
    const type = checker.getTypeAtLocation(place.kind === 'asserted' && (api.isAsExpression(node) || api.isTypeAssertionExpression(node)) ? node.expression : node);
    const wanted = place.kind === 'asserted' ? checker.getTypeAtLocation(node) : place.kind === 'given' && !isConsole(node) ? checker.getContextualType(node) : undefined;
    const owner = node.parent;
    const call = (api.isCallExpression(owner) || api.isNewExpression(owner)) && owner.arguments?.includes(node) === true ? owner : undefined;
    // A function of the project that chooses its type is read like the others: what it does with its argument
    // is in the project, and is compared there.
    const called = call === undefined ? undefined : checker.getResolvedSignature(call)?.getDeclaration();
    // A function that is given is not a value that leaves: what it returns is, and the type of the call says so.
    const isFunction = api.isArrowFunction(node) || api.isFunctionExpression(node);
    const chooses = !isFunction && called !== undefined && called.getSourceFile().isDeclarationFile && (called.typeParameters?.length ?? 0) > 0;
    // What a test is asked to check is told apart there, whatever type the check takes: `expect(found).toBeNull()`.
    const callee = call !== undefined && api.isCallExpression(call) ? call.expression : undefined;
    const checked = callee !== undefined && api.isIdentifier(api.isPropertyAccessExpression(callee) ? callee.expression : callee) && ['expect', 'assert'].includes((api.isPropertyAccessExpression(callee) ? callee.expression : callee).getText());
    const value = read.shape(type);
    const expected = wanted === undefined ? undefined : read.shape(wanted);
    return {
      value,
      expected,
      holdsNull: named.holdsNull(value) || (expected !== undefined && named.holdsNull(expected)),
      returned: call !== undefined && chooses ? read.shape(checker.getTypeAtLocation(call)) : undefined,
      top: read.top(type),
      isAny: (type.flags & api.TypeFlags.Any) !== 0,
      isChecked: checked,
      isOpen: wanted !== undefined && (wanted.isUnion() ? wanted.types : [wanted]).some((member) => (member.flags & api.TypeFlags.TypeParameter) !== 0),
    };
  };
  const first = new Map<string, readonly Seen[]>();
  const firstOf = (fileName: string): readonly Seen[] => {
    const known = first.get(fileName);
    if (known !== undefined) return known;
    const sourceFile = before.program.getSourceFile(fileName);
    const seen = sourceFile === undefined ? [] : placesOf(api, sourceFile).map((place) => see(before, old, place));
    first.set(fileName, seen);
    return seen;
  };

  /** Whether a place tells the two apart, given what it was and what it is. */
  const crosses = (kind: Kind, was: Seen, now: Seen): boolean => {
    const moved = was.value !== now.value;
    switch (kind) {
      case 'given': {
        if (was.expected === undefined || now.expected === undefined) return false;
        const follows = was.expected !== now.expected;
        // A value typed `any` enters a type that changed: nothing checked what it holds.
        if (!moved) return follows && was.isAny;
        if (was.isChecked) return true;
        if (was.isOpen) return false;
        // A function that chooses its type from what it is given follows anything. It is taken to keep the value
        // only when what it gives back changes too: `useState(null)` does, a function that sends its argument away
        // does not.
        return !follows || (was.returned !== undefined && was.returned === now.returned);
      }
      case 'asserted':
        return !moved && was.expected !== now.expected;
      case 'printed':
        return was.top !== now.top;
      case 'compared-undefined':
        return was.top !== now.top;
      case 'compared-null':
        // Still `null` for a part of what is compared, or `undefined` meant something before the fix.
        return moved && (now.top.startsWith('null') || was.top.endsWith('undefined'));
    }
  };

  return {
    /** The places where the fixes of `after` are told apart from what they replace, and the comparisons to rewrite. */
    compare(after: Side, files: readonly string[]): { readonly crossings: readonly Crossing[]; readonly compared: readonly Compared[] } {
      const now = reader(api, after.program, after.checker, named);
      const crossings: Mut<Crossing[]> = [];
      const compared: Mut<Compared[]> = [];
      for (const fileName of files) {
        const sourceFile = after.program.getSourceFile(fileName);
        const original = before.program.getSourceFile(fileName);
        if (sourceFile === undefined || original === undefined) continue;
        const was = firstOf(fileName);
        const originals = placesOf(api, original);
        placesOf(api, sourceFile).forEach((place, index) => {
          const then = was[index];
          const written = originals[index];
          if (then === undefined || written === undefined || !then.holdsNull) return;
          const seen = see(after, now, place);
          const start = place.node.getStart(sourceFile);
          if (crosses(written.kind, then, seen)) {
            const line = api.getLineAndCharacterOfPosition(original, written.node.getStart(original)).line;
            crossings.push({ file: fileName, start, length: place.node.getEnd() - start, where: `${fileName}:${line} crossing ${index}` });
          } else if (written.kind === 'compared-null' && written.other !== undefined && then.value !== seen.value && seen.top.trim() === 'undefined') {
            compared.push({ file: fileName, start: written.other.getStart(original), end: written.other.getEnd() });
          }
        });
      }
      return { crossings, compared };
    },
  };
}

/** How many types are followed from one place when looking for the fixes behind it. */
const REACH = 400;

/**
 * The places of the text that say what a value at `[start, end)` of a file may hold: the declarations of the names
 * written there, and those of every member of their types, through the types the project declares. A fix of
 * `no-null` written in one of them is one the place depends on. A hint for the search: it names too much rather
 * than too little, and what is kept is compiled and compared again.
 */
export function declaredBehind(api: typeof ts, checker: ts.TypeChecker, sourceFile: ts.SourceFile, from: number, to: number): readonly { readonly file: string; readonly start: number; readonly end: number }[] {
  // An error on the name of a property or of an attribute is about the value written for it.
  const innermost = (node: ts.Node): ts.Node => api.forEachChild(node, (child) => (child.getStart(sourceFile) <= from && to <= child.getEnd() ? innermost(child) : undefined)) ?? node;
  const inner = innermost(sourceFile);
  const named = inner.parent;
  // And one on the word `return` is about what is returned.
  const whole = api.isReturnStatement(inner)
    ? inner
    : named !== undefined && (api.isJsxAttribute(named) || api.isPropertyAssignment(named) || api.isShorthandPropertyAssignment(named) || api.isVariableDeclaration(named))
      ? named
      : undefined;
  const start = whole === undefined ? from : whole.getStart(sourceFile);
  const end = whole === undefined ? to : whole.getEnd();
  const found: Mut<{ readonly file: string; readonly start: number; readonly end: number }[]> = [{ file: sourceFile.fileName, start, end }];
  const seen: Mut<Set<ts.Type>> = new Set();
  const declared: Mut<Set<ts.Node>> = new Set();
  const take = (declaration: ts.Node): void => {
    if (declared.has(declaration)) return;
    declared.add(declaration);
    const file = declaration.getSourceFile();
    if (file.isDeclarationFile) return;
    // Of a function, what it says it takes and gives: its body is another matter, unless it says nothing.
    const written = api.isFunctionDeclaration(declaration) || api.isMethodDeclaration(declaration) || api.isArrowFunction(declaration) || api.isFunctionExpression(declaration) ? declaration : undefined;
    const body = written?.type === undefined ? undefined : written.body;
    found.push({ file: file.fileName, start: declaration.getStart(file), end: body === undefined ? declaration.getEnd() : body.getStart(file) });
    // A name made from a call holds what the function gives: `const ref = useFocus()`.
    let made = api.isVariableDeclaration(declaration) ? declaration.initializer : undefined;
    while (made !== undefined && (api.isParenthesizedExpression(made) || api.isAwaitExpression(made) || api.isNonNullExpression(made))) made = made.expression;
    const giver = made !== undefined && api.isCallExpression(made) ? checker.getResolvedSignature(made)?.getDeclaration() : undefined;
    if (giver !== undefined) take(giver);
  };
  const follow = (type: ts.Type): void => {
    if (seen.has(type) || seen.size > REACH) return;
    seen.add(type);
    for (const symbol of [type.aliasSymbol, type.getSymbol()]) for (const declaration of symbol?.getDeclarations() ?? []) take(declaration);
    if (type.isUnionOrIntersection()) for (const member of type.types) follow(member);
    for (const argument of [...typeArgumentsOf(api, checker, type).unwrapOr([]), ...(type.aliasTypeArguments ?? [])]) follow(argument);
    for (const property of checker.getPropertiesOfType(type)) {
      const declarations = property.getDeclarations() ?? [];
      // A member a library declares cannot hold a fix; one the project declares is followed.
      if (declarations.some((declaration) => !declaration.getSourceFile().isDeclarationFile)) {
        for (const declaration of declarations) take(declaration);
        follow(checker.getTypeOfSymbol(property));
      }
    }
    for (const signature of type.getCallSignatures()) {
      for (const parameter of signature.getParameters()) follow(checker.getTypeOfSymbol(parameter));
      follow(signature.getReturnType());
    }
  };
  const visit = (node: ts.Node): void => {
    if (node.getEnd() <= start || node.getStart(sourceFile) >= end) return;
    if (node.getStart(sourceFile) >= start && node.getEnd() <= end && api.isExpression(node)) {
      follow(checker.getTypeAtLocation(node));
      const expected = checker.getContextualType(node);
      if (expected !== undefined) follow(expected);
      if (api.isIdentifier(node)) for (const declaration of checker.getSymbolAtLocation(node)?.getDeclarations() ?? []) take(declaration);
      // What the value is given to: the parameter of the function that is called, the property that is written,
      // the function that returns it.
      const owner = node.parent;
      if ((api.isCallExpression(owner) || api.isNewExpression(owner)) && owner.arguments?.includes(node) === true) {
        const parameters = checker.getResolvedSignature(owner)?.getParameters() ?? [];
        const parameter = parameters[owner.arguments.indexOf(node)] ?? parameters.at(-1);
        for (const declaration of parameter?.getDeclarations() ?? []) take(declaration);
      }
      if (api.isPropertyAssignment(owner) && owner.initializer === node) {
        const holder = checker.getContextualType(owner.parent);
        const property = holder === undefined || !api.isIdentifier(owner.name) ? undefined : checker.getPropertyOfType(holder, owner.name.text);
        for (const declaration of property?.getDeclarations() ?? []) take(declaration);
      }
      if (api.isReturnStatement(owner) || (api.isArrowFunction(owner) && owner.body === node)) {
        const returning = api.findAncestor(owner, (outer) => api.isFunctionLike(outer));
        if (returning !== undefined) take(returning);
      }
    }
    api.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}
