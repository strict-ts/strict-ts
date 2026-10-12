// The TypeProvider of the TypeScript 6 API, and the only place in core that knows a compiler. The compiler itself is
// passed in by the caller (the CLI imports it, the playground loads it in the page), so core imports its types only.
import type ts from '@typescript/typescript6';
import { type Diagnostic, diagnosticAt, locator, type Position } from '../diagnostic.js';
import type { Mut } from '../mut.js';
import { pattern, wholeNumber } from '../unsafe/run.js';
import { record } from '../record.js';
import type { Callee, ExportedValue, SourceFile, Type, TypeProvider } from '../provider.js';
import type { Alias, Node } from '../syntax.js';

/** The methods that give back something their receiver holds. */
/** The collections of the library, and which of the types they are given is the type of what they hold. */
const HOLDS: Readonly<Record<string, number>> = { Array: 0, ReadonlyArray: 0, Set: 0, ReadonlySet: 0, WeakSet: 0, Map: 1, ReadonlyMap: 1, WeakMap: 1, Record: 1 };
/** The types of the library that are another view of the one they are given. */
const SEEN_AS: readonly string[] = ['Partial', 'Readonly', 'Required', 'NonNullable'];
/** The functions of the library that make something new, holding nothing of what they were given. */
const MAKES_NEW: readonly string[] = ['structuredClone', 'parse', 'stringify', 'createElement', 'createElementNS', 'createTextNode', 'cloneNode', 'keys', 'getOwnPropertyNames', 'getBoundingClientRect', 'getImageData', 'createImageData', 'fetch', 'now', 'toISOString'];
const GIVES_A_PART: readonly string[] = ['find', 'findLast', 'at', 'get', 'pop', 'shift'];
/** The methods that put what they are given into their receiver. */
const STORES: readonly string[] = ['push', 'unshift', 'splice', 'fill', 'set', 'add', 'append', 'prepend'];
/** The methods that give back a new container of what their receiver holds. */
const GIVES_A_COPY: readonly string[] = ['slice', 'filter', 'concat', 'flat', 'toSorted', 'toReversed', 'toSpliced', 'with', 'values', 'entries'];

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

  const admitsUndefined = (type: ts.Type): boolean => (type.isUnion() ? type.types : [type]).some((member) => (member.flags & (api.TypeFlags.Undefined | api.TypeFlags.Void)) !== 0);
  const exactOptional = program.getCompilerOptions().exactOptionalPropertyTypes === true;
  /**
   * Whether a property, or a parameter of a function type, may be given `undefined` on purpose. One that is only
   * optional may not, as far as its type is written: its `undefined` is its absence.
   */
  const takesUndefined = (symbol: ts.Symbol): boolean => {
    const type = checker.getTypeOfSymbol(symbol);
    if (!admitsUndefined(type)) return false;
    const declaration = symbol.valueDeclaration;
    const optional = declaration !== undefined && (api.isPropertySignature(declaration) || api.isPropertyDeclaration(declaration) || api.isParameter(declaration)) && declaration.questionToken !== undefined;
    // Written `name?: T`: what the type written after it says. The compiler keeps the two apart for a property
    // when the project asks for exact optional properties, and then a type that is made (`Partial<T>`) is read too.
    if (optional && declaration.type !== undefined) return admitsUndefined(checker.getTypeFromTypeNode(declaration.type));
    const given = checker.getUndefinedType();
    return !exactOptional || (symbol.flags & api.SymbolFlags.Property) === 0 || (type.isUnion() ? type.types : [type]).some((member) => member === given);
  };
  const isUndefinedWritten = (written: ts.Expression): boolean => {
    let expression = written;
    while (api.isParenthesizedExpression(expression)) expression = expression.expression;
    return (api.isIdentifier(expression) && expression.text === 'undefined') || api.isVoidExpression(expression);
  };
  /**
   * The same as `hiddenDefaults`, for an assignment by a pattern: `({ a = 1, b: [c = 2] } = value)`. The pattern
   * is written as an object or an array, and each default as an assignment inside it.
   */
  const assignedDefaults = (pattern: ts.Expression, given: ts.Type): readonly ts.Node[] => {
    const holder = checker.getNonNullableType(given);
    const hides = (key: string | undefined, byPosition: boolean, written: ts.Expression): boolean => {
      if (isUndefinedWritten(written)) return false;
      // A name that is computed: which property it is is not known.
      if (key === undefined) return true;
      const property = checker.getPropertyOfType(holder, key);
      const indexed = property === undefined ? checker.getIndexTypeOfType(holder, byPosition ? api.IndexKind.Number : api.IndexKind.String) : undefined;
      return property !== undefined ? takesUndefined(property) : indexed !== undefined && admitsUndefined(indexed);
    };
    const inside = (key: string | undefined, byPosition: boolean, target: ts.Expression): readonly ts.Node[] => {
      // `target = default`, or a pattern of its own.
      const assigned = api.isBinaryExpression(target) && target.operatorToken.kind === api.SyntaxKind.EqualsToken ? target : undefined;
      const place = assigned?.left ?? target;
      const property = key === undefined ? undefined : checker.getPropertyOfType(holder, key);
      const held = property !== undefined ? checker.getTypeOfSymbol(property) : checker.getIndexTypeOfType(holder, byPosition ? api.IndexKind.Number : api.IndexKind.String);
      const deeper = held !== undefined && (api.isObjectLiteralExpression(place) || api.isArrayLiteralExpression(place)) ? assignedDefaults(place, held) : [];
      return [...(assigned !== undefined && hides(key, byPosition, assigned.right) ? [assigned] : []), ...deeper];
    };
    if (api.isArrayLiteralExpression(pattern)) {
      return pattern.elements.flatMap((element, index) => (api.isOmittedExpression(element) || api.isSpreadElement(element) ? [] : inside(String(index), true, element)));
    }
    if (!api.isObjectLiteralExpression(pattern)) return [];
    return pattern.properties.flatMap((member) => {
      if (api.isShorthandPropertyAssignment(member)) {
        return member.objectAssignmentInitializer !== undefined && hides(member.name.text, false, member.objectAssignmentInitializer) ? [member] : [];
      }
      if (!api.isPropertyAssignment(member)) return [];
      const named = member.name;
      return inside(api.isIdentifier(named) || api.isStringLiteralLike(named) || api.isNumericLiteral(named) ? named.text : undefined, false, member.initializer);
    });
  };
  /** What a caller may give a parameter that has no written type: by each type the function is expected to have. */
  const expectedParameters = (parameter: ts.ParameterDeclaration): readonly ts.Symbol[] => {
    const owner = parameter.parent;
    if (!api.isArrowFunction(owner) && !api.isFunctionExpression(owner)) return [];
    const index = owner.parameters.indexOf(parameter);
    return (checker.getContextualType(owner)?.getCallSignatures() ?? []).flatMap((signature) => signature.getParameters()[index] ?? []);
  };
  /**
   * The parameters and the names of a pattern whose default stands in for an `undefined` their type admits: see
   * `hiddenDefaults` in the syntax. `root` is a parameter or a declared variable.
   */
  const hiddenDefaults = (root: ts.ParameterDeclaration | ts.VariableDeclaration): readonly ts.Node[] => {
    const found: Mut<ts.Node[]> = [];
    if (api.isParameter(root) && root.initializer !== undefined && !isUndefinedWritten(root.initializer)) {
      if (root.type === undefined ? expectedParameters(root).some(takesUndefined) : admitsUndefined(checker.getTypeFromTypeNode(root.type))) found.push(root);
    }
    const look = (pattern: ts.BindingName): void => {
      if (api.isIdentifier(pattern)) return;
      const holder = checker.getNonNullableType(checker.getTypeAtLocation(pattern));
      pattern.elements.forEach((element, index) => {
        if (api.isOmittedExpression(element)) return;
        look(element.name);
        if (element.initializer === undefined || element.dotDotDotToken !== undefined || isUndefinedWritten(element.initializer)) return;
        const named = element.propertyName ?? element.name;
        const key = api.isArrayBindingPattern(pattern) ? String(index) : api.isIdentifier(named) || api.isStringLiteralLike(named) || api.isNumericLiteral(named) ? named.text : undefined;
        // A name that is computed: which property it is is not known.
        if (key === undefined) return void found.push(element);
        const property = checker.getPropertyOfType(holder, key);
        const indexed = property === undefined ? checker.getIndexTypeOfType(holder, api.isArrayBindingPattern(pattern) ? api.IndexKind.Number : api.IndexKind.String) : undefined;
        if (property !== undefined ? takesUndefined(property) : indexed !== undefined && admitsUndefined(indexed)) found.push(element);
      });
    };
    look(root.name);
    return found;
  };

  const isMut = (written: ts.TypeNode | undefined): boolean =>
    written !== undefined && api.isTypeReferenceNode(written) && api.isIdentifier(written.typeName) && written.typeName.text === 'Mut';

  /**
   * Whether a write through a place of type `wanted` could put in a value of type `given` something `given` does
   * not allow. Not the same as `wanted` being a wider type: one that names fewer properties is wider, and nothing
   * is written to a property it does not name. What can be replaced whole is compared whole: a property that can
   * be written, an element of an array that is not read-only. What cannot (the object itself, what a read-only
   * property holds, an element of a read-only array) is compared property by property.
   */
  const widens = (wanted: ts.Type, given: ts.Type, depth: number): boolean => {
    const whole = (): boolean => !checker.isTypeAssignableTo(wanted, given);
    if (depth > 3 || wanted.isUnion() || given.isUnion()) return whole();
    const isList = (type: ts.Type): boolean => checker.isArrayType(type) || checker.isTupleType(type);
    if (isList(wanted) || isList(given)) {
      const elements = [wanted, given].map((type) => checker.getIndexTypeOfType(type, api.IndexKind.Number));
      const [asked, held] = elements;
      const readOnly = checker.typeToString(wanted).startsWith('readonly ');
      return readOnly && isList(wanted) && isList(given) && asked !== undefined && held !== undefined ? widens(asked, held, depth + 1) : whole();
    }
    const isObject = (type: ts.Type): boolean => (type.flags & api.TypeFlags.Object) !== 0 && type.getCallSignatures().length === 0;
    const isTable = (type: ts.Type): boolean => checker.getIndexTypeOfType(type, api.IndexKind.String) !== undefined;
    if (!isObject(wanted) || !isObject(given) || isTable(wanted) || isTable(given) || wanted.getProperties().length === 0) return whole();
    return wanted.getProperties().some((property) => {
      const counterpart = given.getProperty(property.getName());
      if (counterpart === undefined) return false;
      const asked = checker.getTypeOfSymbol(property);
      const held = checker.getTypeOfSymbol(counterpart);
      // A method is not written; what it takes and gives is the compiler's to compare.
      if (asked.getCallSignatures().length > 0) return false;
      if (!isReadonlySymbol(property)) return !checker.isTypeAssignableTo(asked, held);
      // It cannot be given another value, and what it holds can be written into.
      return (isObject(asked) || isList(asked)) && widens(asked, held, depth + 1);
    });
  };

  /** Whether a written type says `Mut<…>`, itself or anywhere inside: `Mut<Order> | undefined`, `readonly Mut<Line>[]`. */
  const mentionsMut = (written: ts.Node | undefined, depth = 0): boolean => {
    if (written === undefined) return false;
    if (api.isTypeNode(written) && isMut(written)) return true;
    // A name the project gives to a type says what that type says.
    const named = depth < 4 && api.isTypeReferenceNode(written) ? aliasOf(written) : undefined;
    if (named !== undefined && mentionsMut(named, depth + 1)) return true;
    // What the properties of an object type say is about them, and what a function type says is about its call.
    if (api.isTypeLiteralNode(written) || api.isFunctionTypeNode(written) || api.isConstructorTypeNode(written) || api.isMappedTypeNode(written)) return false;
    return api.forEachChild(written, (inner) => mentionsMut(inner, depth)) ?? false;
  };
  /** `Mut<…>` itself, or a name of the project for it. */
  const isMutNamed = (written: ts.TypeNode | undefined, depth = 0): boolean => {
    if (written === undefined) return false;
    if (isMut(written)) return true;
    if (api.isParenthesizedTypeNode(written)) return isMutNamed(written.type, depth);
    // `Mut<Cart> | undefined`: when there is one, it may be changed. Every member that is something has to say so.
    if (api.isUnionTypeNode(written)) {
      const some = written.types.filter((member) => member.kind !== api.SyntaxKind.UndefinedKeyword && !(api.isLiteralTypeNode(member) && member.literal.kind === api.SyntaxKind.NullKeyword));
      return some.length > 0 && some.length < written.types.length && some.every((member) => isMutNamed(member, depth));
    }
    const named = depth < 4 && api.isTypeReferenceNode(written) ? aliasOf(written) : undefined;
    return named !== undefined && isMutNamed(named, depth + 1);
  };
  /** The type a name of the project stands for, when it is one: `type Store = Mut<Map<…>>`. */
  const aliasOf = (written: ts.TypeReferenceNode): ts.TypeNode | undefined => {
    const symbol = checker.getSymbolAtLocation(written.typeName);
    // A name that is imported stands for the one that is exported.
    const target = symbol === undefined || (symbol.flags & api.SymbolFlags.Alias) === 0 ? symbol : checker.getAliasedSymbol(symbol);
    const declaration = (target?.declarations ?? []).find((one) => api.isTypeAliasDeclaration(one));
    return declaration !== undefined && api.isTypeAliasDeclaration(declaration) && isChecked(declaration.getSourceFile()) ? declaration.type : undefined;
  };
  /** A written type without the `Mut<…>`, the `readonly` and the `| undefined` around it. */
  const peeled = (written: ts.TypeNode): ts.TypeNode => {
    if (isMut(written) && api.isTypeReferenceNode(written) && written.typeArguments?.[0] !== undefined) return peeled(written.typeArguments[0]);
    if (api.isTypeOperatorNode(written) && written.operator === api.SyntaxKind.ReadonlyKeyword) return peeled(written.type);
    if (api.isParenthesizedTypeNode(written)) return peeled(written.type);
    const named = api.isTypeReferenceNode(written) ? aliasOf(written) : undefined;
    if (named !== undefined) return peeled(named);
    if (api.isUnionTypeNode(written)) {
      const kept = written.types.filter((member) => member.kind !== api.SyntaxKind.UndefinedKeyword);
      return kept.length === 1 && kept[0] !== undefined ? peeled(kept[0]) : written;
    }
    return written;
  };
  /** The written type of what a name of the program declares: a variable, a parameter, a property. */
  const declaredType = (symbol: ts.Symbol | undefined): ts.TypeNode | undefined =>
    (symbol?.declarations ?? []).flatMap((declaration) =>
      (api.isVariableDeclaration(declaration) || api.isParameter(declaration) || api.isPropertySignature(declaration) || api.isPropertyDeclaration(declaration)) && declaration.type !== undefined ? [declaration.type] : [],
    )[0];
  /**
   * Whether what a list, a map or a set holds may be written into, by the type written for it: `Mut<…>` around the
   * container says the container, `Mut<…>` inside says what it holds.
   */
  const elementsOf = (written: ts.TypeNode | undefined): 'writable' | 'readonly' | 'unknown' => {
    if (written === undefined) return 'unknown';
    const inner = peeled(written);
    // A tuple says it of each thing it holds: one that does not is not written.
    if (api.isTupleTypeNode(inner)) return (inner.elements.length > 0 && inner.elements.every((element) => mentionsMut(element))) || isUnderMut(written) ? 'writable' : 'readonly';
    const name = api.isTypeReferenceNode(inner) && api.isIdentifier(inner.typeName) && !isMut(inner) ? inner.typeName.text : undefined;
    // `Partial<…>`, `Readonly<…>`: the same thing, seen another way.
    const [first] = api.isTypeReferenceNode(inner) ? (inner.typeArguments ?? []) : [];
    if (name !== undefined && SEEN_AS.includes(name) && first !== undefined) return elementsOf(first) === 'writable' || isUnderMut(written) ? 'writable' : 'readonly';
    // A list says it of what it holds; a map, of its values, which is what `get` and a loop over it hand out.
    const held = api.isArrayTypeNode(inner) ? inner.elementType : name !== undefined && api.isTypeReferenceNode(inner) ? inner.typeArguments?.[HOLDS[name] ?? -1] : undefined;
    const says = held !== undefined ? mentionsMut(held) : name !== undefined && HOLDS[name] !== undefined ? false : mentionsMut(inner);
    return says || isUnderMut(written) ? 'writable' : 'readonly';
  };
  /** A number, a text, a boolean, nothing: there is nothing in it to write. */
  const isPlainValue = (type: ts.Type): boolean =>
    (type.isUnion() ? type.types : [type]).every((member) => (member.flags & (api.TypeFlags.StringLike | api.TypeFlags.NumberLike | api.TypeFlags.BooleanLike | api.TypeFlags.BigIntLike | api.TypeFlags.ESSymbolLike | api.TypeFlags.Undefined | api.TypeFlags.Null | api.TypeFlags.EnumLike)) !== 0);
  /**
   * Whether a written type says `Mut<…>` below its top: of what a list, a map or a set holds, or of an object one
   * of its properties holds. A new container of the same things, given there, hands those things over.
   */
  const saysMutInside = (written: ts.TypeNode | undefined): boolean => {
    if (written === undefined) return false;
    const inner = peeled(written);
    if (mentionsMut(inner)) return true;
    const symbol = api.isTypeReferenceNode(inner) ? checker.getSymbolAtLocation(inner.typeName) : undefined;
    const target = symbol === undefined || (symbol.flags & api.SymbolFlags.Alias) === 0 ? symbol : checker.getAliasedSymbol(symbol);
    const members: readonly ts.Node[] = api.isTypeLiteralNode(inner)
      ? inner.members
      : (target?.declarations ?? []).flatMap((declaration): readonly ts.Node[] => (api.isInterfaceDeclaration(declaration) || api.isClassDeclaration(declaration) ? declaration.members : []));
    return members.some((member) => (api.isPropertySignature(member) || api.isPropertyDeclaration(member)) && member.type !== undefined && mentionsMut(member.type) && !isPlainValue(checker.getTypeFromTypeNode(member.type)));
  };
  /** Written inside a `Mut<…>`: `Mut<{ lines: Line[] }>` has asked for the whole of what it wraps. */
  const isUnderMut = (written: ts.Node): boolean => {
    for (let outer: ts.Node | undefined = written.parent; outer !== undefined && (api.isTypeNode(outer) || api.isTypeElement(outer)); outer = outer.parent) {
      if (api.isTypeNode(outer) && isMut(outer)) return true;
    }
    return false;
  };
  /** An object, an array or an instance made where it is written: nobody else holds it. */
  const isMadeInPlace = (written: ts.Expression | undefined): boolean => {
    let expression = written;
    while (expression !== undefined && (api.isParenthesizedExpression(expression) || api.isAsExpression(expression) || api.isSatisfiesExpression(expression))) expression = expression.expression;
    return expression !== undefined && (api.isObjectLiteralExpression(expression) || api.isArrayLiteralExpression(expression) || api.isNewExpression(expression));
  };

  /** The `this` a function declares as its first parameter. */
  const isThis = (parameter: ts.ParameterDeclaration): boolean => api.isIdentifier(parameter.name) && parameter.name.text === 'this';

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
      get isArray() {
        // A union of arrays is one too: each of its members is read the same way.
        return (type.isUnion() ? type.types : [type]).every((member) => checker.isArrayType(member) || checker.isTupleType(member));
      },
      get isTuple() {
        return checker.isTupleType(type);
      },
      get isIndexed() {
        // A table: an object any text is a key of. Not an array nor a text, which are read by position.
        // A type parameter is what its constraint is; a table that may be missing is still one where it is there.
        const known = checker.getBaseConstraintOfType(type) ?? type;
        const present = (known.isUnion() ? known.types : [known]).filter((member) => (member.flags & (api.TypeFlags.Undefined | api.TypeFlags.Null)) === 0);
        const isTable = (member: ts.Type): boolean =>
          (member.flags & api.TypeFlags.Object) !== 0 && checker.getIndexInfosOfType(member).some((info) => (info.keyType.flags & api.TypeFlags.String) !== 0);
        return present.length > 0 && present.every(isTable);
      },
      get isClass() {
        return ((type.getSymbol()?.flags ?? 0) & api.SymbolFlags.Class) !== 0;
      },
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
      get mutableProperties() {
        const asks = (declaration: ts.Declaration): boolean =>
          (api.isPropertySignature(declaration) || api.isPropertyDeclaration(declaration) || api.isParameter(declaration)) && isMut(declaration.type);
        return type
          .getProperties()
          .filter((symbol) => (symbol.declarations ?? []).some(asks))
          .map((symbol) => symbol.getName());
      },
      get optionalProperties() {
        return type
          .getProperties()
          .filter((symbol) => (symbol.flags & api.SymbolFlags.Optional) !== 0)
          .map((symbol) => symbol.getName());
      },
      get element() {
        const held = checker.isArrayType(type) || checker.isTupleType(type) ? checker.getIndexTypeOfType(type, api.IndexKind.Number) : undefined;
        return held === undefined ? undefined : wrapType(held);
      },
      get returns() {
        return type.getCallSignatures().map((signature) => wrapType(signature.getReturnType()));
      },
      get mutableParameters() {
        const declaration = type.getCallSignatures()[0]?.getDeclaration();
        const written = (declaration?.parameters ?? []).filter((parameter) => !isThis(parameter));
        // `Mut<Cart>`, a name the project gives to one, `Mut<Cart> | undefined`, `readonly Mut<Cart>[]`.
        return written.flatMap((parameter, index) => (mentionsMut(parameter.type) ? [index] : []));
      },
      get isWrittenInProject() {
        const declaration = type.getCallSignatures()[0]?.getDeclaration();
        return declaration !== undefined && isChecked(declaration.getSourceFile());
      },
      get defaultedParameters() {
        const written = (type.getCallSignatures()[0]?.getDeclaration()?.parameters ?? []).filter((parameter) => !isThis(parameter));
        return written.flatMap((parameter, index) => (parameter.initializer !== undefined && !isUndefinedWritten(parameter.initializer) ? [index] : []));
      },
      get undefinedParameters() {
        return (type.getCallSignatures()[0]?.getParameters() ?? []).flatMap((parameter, index) => (takesUndefined(parameter) ? [index] : []));
      },
      get isImplemented() {
        const declaration = type.getCallSignatures()[0]?.getDeclaration();
        if (declaration === undefined || !isChecked(declaration.getSourceFile())) return false;
        const written = api.isFunctionDeclaration(declaration) || api.isMethodDeclaration(declaration) || api.isFunctionExpression(declaration) || api.isArrowFunction(declaration) || api.isAccessor(declaration);
        return written && declaration.body !== undefined;
      },
      get mutableReturn() {
        const written = type.getCallSignatures()[0]?.getDeclaration()?.type;
        // `Mut<Order>`, and `Promise<Mut<Order>>` or `Result<Mut<Order>, E>` as well: the word is there.
        const says = (inner: ts.Node): boolean => (api.isTypeNode(inner) && isMut(inner)) || (api.forEachChild(inner, says) ?? false);
        // Or a name the project gives to a type that says it: `type Store = Mut<Map<…>>`.
        return written !== undefined && (says(written) || mentionsMut(written));
      },
      get mutableReceiver() {
        const self = type.getCallSignatures()[0]?.getDeclaration()?.parameters.find(isThis);
        return self?.type !== undefined && isMut(self.type) ? wrapType(checker.getTypeFromTypeNode(self.type)) : undefined;
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

  /**
   * Whether a name is read with a type narrower than the one it is declared with: the declared type accepts values
   * the type here does not.
   */
  const narrowed = (name: ts.Node): boolean => {
    const symbol = checker.getSymbolAtLocation(name);
    if (symbol === undefined || (symbol.flags & (api.SymbolFlags.Variable | api.SymbolFlags.Property | api.SymbolFlags.Accessor)) === 0) return false;
    const access = api.isPropertyAccessExpression(name.parent) && name.parent.name === name ? name.parent : name;
    const declared = checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration ?? name);
    return !checker.isTypeAssignableTo(declared, checker.getTypeAtLocation(access));
  };

  /** Whether the place a name is given to takes the whole of the type the name is declared with. */
  const takesDeclared = (name: ts.Node): boolean => {
    const symbol = checker.getSymbolAtLocation(name);
    const access = api.isPropertyAccessExpression(name.parent) && name.parent.name === name ? name.parent : name;
    if (symbol === undefined || !api.isExpression(access)) return false;
    const expected = checker.getContextualType(access);
    // A place whose type is still to be inferred takes the type of what it is given: the narrowed one.
    if (expected === undefined || (expected.flags & api.TypeFlags.Instantiable) !== 0) return false;
    return checker.isTypeAssignableTo(checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration ?? name), expected);
  };

  /** The name of a member of an object written in place (`name: value`): it is no value, and nothing is expected of it. */
  const isNameOfMember = (node: ts.Node): boolean => {
    const owner = node.parent;
    return (api.isPropertyAssignment(owner) || api.isMethodDeclaration(owner) || api.isAccessor(owner)) && owner.name === node;
  };

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

    /** The places an expression may be, or hold a part or a copy of. */
    const sourcesOf = (given: ts.Expression, as: Alias['as']): readonly Alias[] => {
      let expression = given;
      while (api.isParenthesizedExpression(expression) || api.isNonNullExpression(expression) || api.isAsExpression(expression) || api.isSatisfiesExpression(expression) || api.isAwaitExpression(expression)) {
        expression = expression.expression;
      }
      // A part of a copy is a part; a copy of a part is a copy.
      const under = (inner: Alias['as']): Alias['as'] => (as === 'part' || as === 'element' ? as : inner === 'same' ? as : inner);
      if (api.isIdentifier(expression) || api.isPropertyAccessExpression(expression) || api.isElementAccessExpression(expression)) return [{ place: part(expression), as }];
      // `const self = this`: another name for the object.
      if (expression.kind === api.SyntaxKind.ThisKeyword) return [{ place: part(expression), as }];
      // `new Map(other)`, `new Set(list)`: a new collection of the same things.
      if (api.isNewExpression(expression)) {
        const [first] = expression.arguments ?? [];
        // `new Proxy(target, …)` is the target, seen through.
        if (first !== undefined && api.isIdentifier(expression.expression) && expression.expression.text === 'Proxy') return sourcesOf(first, as);
        return first !== undefined && !api.isSpreadElement(first) && isCollection(expression) ? sourcesOf(first, under('copy')) : [];
      }
      if (api.isConditionalExpression(expression)) return [...sourcesOf(expression.whenTrue, as), ...sourcesOf(expression.whenFalse, as)];
      if (api.isBinaryExpression(expression)) {
        const operator = expression.operatorToken.kind;
        if (operator === api.SyntaxKind.CommaToken) return sourcesOf(expression.right, as);
        const chooses = operator === api.SyntaxKind.QuestionQuestionToken || operator === api.SyntaxKind.BarBarToken || operator === api.SyntaxKind.AmpersandAmpersandToken;
        return chooses ? [...sourcesOf(expression.left, as), ...sourcesOf(expression.right, as)] : [];
      }
      if (api.isArrayLiteralExpression(expression)) {
        // One of the things an array written in place holds is one of the things written there.
        return expression.elements.flatMap((element) =>
          api.isSpreadElement(element) ? sourcesOf(element.expression, as === 'element' ? 'element' : under('copy')) : sourcesOf(element, as === 'element' ? 'same' : under('copy')),
        );
      }
      if (api.isObjectLiteralExpression(expression)) {
        return expression.properties.flatMap((member) =>
          api.isSpreadAssignment(member) ? sourcesOf(member.expression, under('copy')) : api.isPropertyAssignment(member) ? sourcesOf(member.initializer, under('copy')) : api.isShorthandPropertyAssignment(member) ? sourcesOf(member.name, under('copy')) : [],
        );
      }
      if (api.isCallExpression(expression)) {
        const callee = expression.expression;
        if (api.isPropertyAccessExpression(callee) && isCollection(callee.expression)) {
          const name = callee.name.text;
          const holder = callee.expression;
          const [first] = expression.arguments;
          // `Object.values(place)`, `Array.from(place)`: asked first, `Object` and `Array` hold nothing themselves.
          if (first !== undefined && api.isIdentifier(holder) && ((holder.text === 'Object' && ['values', 'entries'].includes(name)) || (holder.text === 'Array' && name === 'from'))) {
            return sourcesOf(first, under('copy'));
          }
          // What a method of a place gives back may be a part of it, or a new container of what it holds.
          if (GIVES_A_PART.includes(name)) return sourcesOf(callee.expression, 'element');
          if (GIVES_A_COPY.includes(name)) return sourcesOf(callee.expression, under('copy'));
          // `map` gives what its function gives: a new thing for each, or the same ones.
          if (name === 'map' || name === 'flatMap') {
            const [each] = expression.arguments;
            const makes = each !== undefined && api.isArrowFunction(each) && !api.isBlock(each.body) && isMadeInPlace(each.body);
            return makes ? [] : sourcesOf(callee.expression, under('copy'));
          }
        }
        // What a function of the project gives back is the callee's to say: its return type does.
        // A part of it is the callee's too; so is what a new container of what it gave holds.
        const declaration = checker.getResolvedSignature(expression)?.getDeclaration();
        if (declaration === undefined || isChecked(declaration.getSourceFile())) return [{ place: part(expression), as: as === 'same' ? 'result' : as }];
        // A function of the library says nothing. What it gives back may be what it was given, or a part of it
        // (`Promise.resolve(value)`, `Array.of(value)`, `weak.deref()`): unless it is a number or a text, or a
        // function known to make something new.
        const result = checker.getTypeAtLocation(expression);
        if (isPlainValue(result) || (api.isIdentifier(callee) && MAKES_NEW.includes(callee.text)) || (api.isPropertyAccessExpression(callee) && MAKES_NEW.includes(callee.name.text))) return [];
        // A new list of numbers or texts holds nothing of anyone.
        const listed = checker.isArrayType(result) ? checker.getIndexTypeOfType(result, api.IndexKind.Number) : undefined;
        if (listed !== undefined && isPlainValue(listed)) return [];
        // Its object too, unless that is a name of the library itself (`Object`, `Promise`, `document`).
        const isOfLibrary = (named: ts.Expression): boolean =>
          api.isIdentifier(named) && (checker.getSymbolAtLocation(named)?.declarations ?? []).every((one) => !isChecked(one.getSourceFile()));
        const given = [...(api.isPropertyAccessExpression(callee) && !isOfLibrary(callee.expression) ? [callee.expression] : []), ...expression.arguments.filter((argument) => !api.isSpreadElement(argument))];
        // One of the things a list holds, when it is given a list; a part of anything else.
        const holds = (one: ts.Expression): boolean => {
          const type = checker.getNonNullableType(checker.getTypeAtLocation(one));
          return checker.isArrayType(type) || checker.isTupleType(type) || HOLDS[type.getSymbol()?.getName() ?? ''] !== undefined;
        };
        return given.flatMap((one) => (isPlainValue(checker.getTypeAtLocation(one)) || api.isFunctionLike(one) ? [] : sourcesOf(one, holds(one) ? 'element' : 'part')));
      }
      return [];
    };
    /** An array, a map or a set of the library: what `find`, `get`, `filter` mean there is known. A class of the project says what its own give. */
    const isCollection = (holder: ts.Expression): boolean => {
      const type = checker.getNonNullableType(checker.getTypeAtLocation(holder));
      return (type.isUnion() ? type.types : [type]).every((member) => {
        if (checker.isArrayType(member) || checker.isTupleType(member)) return true;
        const declarations = member.getSymbol()?.getDeclarations() ?? [];
        return declarations.length > 0 && declarations.every((declaration) => program.isSourceFileDefaultLibrary(declaration.getSourceFile()));
      });
    };
    const assignedTo = new Map<ts.Symbol, readonly ts.Expression[]>();
    /** What a pattern on the left of an assignment took the variable out of. */
    const takenFrom = new Map<ts.Symbol, readonly ts.Expression[]>();
    /** What is assigned to a variable after its declaration, in the function that declares it. */
    const laterValues = (symbol: ts.Symbol, declaration: ts.Node): readonly ts.Expression[] => {
      const known = assignedTo.get(symbol);
      if (known !== undefined) return known;
      let scope: ts.Node = declaration;
      while (!api.isSourceFile(scope) && !api.isFunctionLike(scope)) scope = scope.parent;
      const found: Mut<ts.Expression[]> = [];
      const taken: Mut<ts.Expression[]> = [];
      const isIt = (name: ts.Node): boolean => api.isIdentifier(name) && (api.isShorthandPropertyAssignment(name.parent) ? checker.getShorthandAssignmentValueSymbol(name.parent) : checker.getSymbolAtLocation(name)) === symbol;
      const names = (pattern: ts.Node): boolean => isIt(pattern) || (api.forEachChild(pattern, names) ?? false);
      const look = (inner: ts.Node): void => {
        if (api.isBinaryExpression(inner) && inner.operatorToken.kind === api.SyntaxKind.EqualsToken && isIt(inner.left)) found.push(inner.right);
        // `[a, b] = pair`, `({ a } = holder)`: the name is given one of the things the right side holds.
        if (api.isBinaryExpression(inner) && inner.operatorToken.kind === api.SyntaxKind.EqualsToken && (api.isArrayLiteralExpression(inner.left) || api.isObjectLiteralExpression(inner.left)) && names(inner.left)) taken.push(inner.right);
        api.forEachChild(inner, look);
      };
      look(scope);
      assignedTo.set(symbol, found);
      takenFrom.set(symbol, taken);
      return found;
    };
    const keptIn = new Map<ts.Symbol, readonly ts.Expression[]>();
    /** What is put into a variable after its declaration: by `push` and its kin, by a write to a property or a position. */
    const storedIn = (symbol: ts.Symbol, declaration: ts.Node): readonly ts.Expression[] => {
      const known = keptIn.get(symbol);
      if (known !== undefined) return known;
      let scope: ts.Node = declaration;
      while (!api.isSourceFile(scope) && !api.isFunctionLike(scope)) scope = scope.parent;
      const found: Mut<ts.Expression[]> = [];
      const isIt = (name: ts.Node): boolean => api.isIdentifier(name) && checker.getSymbolAtLocation(name) === symbol;
      const look = (inner: ts.Node): void => {
        if (api.isCallExpression(inner) && api.isPropertyAccessExpression(inner.expression) && STORES.includes(inner.expression.name.text) && isIt(inner.expression.expression)) {
          // A method the project wrote keeps only what its parameter says may be written: the rest it cannot put
          // anywhere that says so. A method of the library keeps what it is given.
          const declaration = checker.getResolvedSignature(inner)?.getDeclaration();
          const own = declaration !== undefined && isChecked(declaration.getSourceFile()) ? declaration.parameters.filter((parameter) => !isThis(parameter)) : undefined;
          found.push(...inner.arguments.flatMap((argument, index) => (own !== undefined && !mentionsMut(own[Math.min(index, own.length - 1)]?.type) ? [] : [api.isSpreadElement(argument) ? argument.expression : argument])));
        }
        // `Object.assign(holder, a, b)` puts in the holder what `a` and `b` hold.
        if (api.isCallExpression(inner) && api.isPropertyAccessExpression(inner.expression) && api.isIdentifier(inner.expression.expression) && inner.expression.expression.text === 'Object' && inner.expression.name.text === 'assign') {
          const [target, ...sources] = inner.arguments;
          if (target !== undefined && isIt(target)) found.push(...sources.filter((source) => !api.isSpreadElement(source)));
        }
        if (api.isBinaryExpression(inner) && inner.operatorToken.kind === api.SyntaxKind.EqualsToken && (api.isPropertyAccessExpression(inner.left) || api.isElementAccessExpression(inner.left)) && isIt(inner.left.expression)) {
          found.push(inner.right);
        }
        api.forEachChild(inner, look);
      };
      look(scope);
      keptIn.set(symbol, found);
      return found;
    };
    const aliasesOf = (name: ts.Identifier): readonly Alias[] => {
      const owner = name.parent;
      const symbol = api.isShorthandPropertyAssignment(owner) ? checker.getShorthandAssignmentValueSymbol(owner) : checker.getSymbolAtLocation(name);
      const declaration = symbol?.valueDeclaration;
      if (symbol === undefined || declaration === undefined) return [];
      // A piece taken out by a pattern is a part of what the pattern is given; its rest is a copy.
      let holder: ts.Node = declaration;
      let as: Alias['as'] = 'same';
      while (api.isBindingElement(holder) || api.isObjectBindingPattern(holder) || api.isArrayBindingPattern(holder)) {
        if (api.isBindingElement(holder)) as = holder.dotDotDotToken !== undefined && as === 'same' ? 'copy' : api.isArrayBindingPattern(holder.parent) ? 'element' : 'part';
        holder = holder.parent;
      }
      if (!api.isVariableDeclaration(holder)) return [];
      // A variable declared `Mut<…>` says it may be written: what it is given is checked where it is given.
      if (isMut(holder.type)) return [];
      const loop = holder.parent.parent;
      const first = api.isForOfStatement(loop) ? sourcesOf(loop.expression, 'element') : holder.initializer === undefined ? [] : sourcesOf(holder.initializer, as);
      const later = laterValues(symbol, holder).flatMap((value) => sourcesOf(value, 'same'));
      return [...first, ...later, ...(takenFrom.get(symbol) ?? []).flatMap((value) => sourcesOf(value, 'element')), ...storedIn(symbol, holder).flatMap((value) => sourcesOf(value, 'copy'))];
    };

    /** What the return type of the function a call runs says of what the collection it gives holds. */
    const resultElements = (call: ts.CallExpression): 'writable' | 'readonly' | 'unknown' => {
      const declaration = checker.getResolvedSignature(call)?.getDeclaration();
      if (declaration === undefined || !isChecked(declaration.getSourceFile()) || declaration.type === undefined) return 'unknown';
      // `Promise<readonly Mut<Line>[]>`: what is awaited.
      const written = declaration.type;
      const promised = api.isTypeReferenceNode(written) && api.isIdentifier(written.typeName) && written.typeName.text === 'Promise' ? written.typeArguments?.[0] : undefined;
      return elementsOf(promised ?? written);
    };

    /** The members a method of a class stands for under the types the class extends or implements. */
    const overriddenBy = (method: ts.Node): readonly { readonly mutableReceiver: boolean; readonly mutableParameters: readonly number[] }[] => {
      const holder = method.parent;
      if (!api.isMethodDeclaration(method) || !api.isClassLike(holder) || !api.isIdentifier(method.name)) return [];
      const name = method.name.text;
      return (holder.heritageClauses ?? []).flatMap((clause) =>
        clause.types.flatMap((base) => {
          const member = checker.getPropertyOfType(checker.getTypeAtLocation(base), name);
          if (member === undefined) return [];
          const type = wrapType(checker.getTypeOfSymbolAtLocation(member, base));
          return [{ mutableReceiver: type.mutableReceiver !== undefined, mutableParameters: type.mutableParameters }];
        }),
      );
    };

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
      if (api.isTypeQueryNode(node)) return { ...base, kind: 'type-query' };
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
          holdsValue: api.isPropertyDeclaration(node) || api.isParameter(node),
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
          get fromModule() {
            const short = node.parent;
            const named = api.isShorthandPropertyAssignment(short) ? checker.getShorthandAssignmentValueSymbol(short) : checker.getSymbolAtLocation(node);
            const symbol = named !== undefined && (named.flags & api.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(named) : named;
            const declaration = symbol?.valueDeclaration;
            if (declaration === undefined || !api.isVariableDeclaration(declaration) || !isChecked(declaration.getSourceFile()) || declaration.getSourceFile() === node.getSourceFile()) return undefined;
            return mentionsMut(declaration.type) ? 'mutable' : 'readonly';
          },
          // Asked of few identifiers, and it needs the checker: computed on demand.
          get parameter() {
            // In `{ cart }`, the name stands for the variable.
            const short = node.parent;
            const declaration = (api.isShorthandPropertyAssignment(short) ? checker.getShorthandAssignmentValueSymbol(short) : checker.getSymbolAtLocation(node))?.valueDeclaration;
            let owner: ts.Node | undefined = declaration;
            while (owner !== undefined && (api.isBindingElement(owner) || api.isObjectBindingPattern(owner) || api.isArrayBindingPattern(owner))) {
              owner = owner.parent;
            }
            if (owner === undefined || !api.isParameter(owner)) return 'none';
            // `Mut<Cart>`, or a name the project gives to a type that is one: `type Store = Mut<Map<…>>`.
            if (owner.type !== undefined) return isMutNamed(owner.type) ? 'mutable' : 'readonly';
            // With no written type, a parameter has the type of where its function is given: what that place says.
            const given = expectedParameters(owner).map((symbol) => symbol.valueDeclaration);
            return given.length > 0 && given.every((declaration) => declaration !== undefined && api.isParameter(declaration) && isMutNamed(declaration.type)) ? 'mutable' : 'readonly';
          },
          get isNarrowed() {
            return narrowed(node);
          },
          get takesDeclared() {
            return takesDeclared(node);
          },
          get aliasOf() {
            return aliasesOf(node);
          },
          get elements() {
            const owner = node.parent;
            return elementsOf(declaredType(api.isShorthandPropertyAssignment(owner) ? checker.getShorthandAssignmentValueSymbol(owner) : checker.getSymbolAtLocation(node)));
          },
          get leftOut() {
            const declaration = checker.getSymbolAtLocation(node)?.valueDeclaration;
            if (declaration === undefined || !api.isBindingElement(declaration) || declaration.dotDotDotToken === undefined) return [];
            const pattern = declaration.parent;
            const owner = pattern.parent;
            // A constant only: a variable may be given another object later.
            const isConstant = api.isVariableDeclaration(owner) && (api.getCombinedNodeFlags(owner) & api.NodeFlags.Const) !== 0;
            if (!api.isObjectBindingPattern(pattern) || !isConstant) return [];
            return pattern.elements.flatMap((element) => {
              const name = element.propertyName ?? element.name;
              return element.dotDotDotToken === undefined && (api.isIdentifier(name) || api.isStringLiteral(name)) ? [name.text] : [];
            });
          },
          get declaredAt() {
            const owner = node.parent;
            const symbol = api.isShorthandPropertyAssignment(owner) ? checker.getShorthandAssignmentValueSymbol(owner) : checker.getSymbolAtLocation(node);
            const declaration = symbol?.valueDeclaration;
            const declares = declaration !== undefined && (api.isVariableDeclaration(declaration) || api.isParameter(declaration) || api.isFunctionDeclaration(declaration));
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
        return { ...base, kind: 'call', callee: part(node.expression), arguments: node.arguments.map(part), hasSpread: node.arguments.some(api.isSpreadElement), get madeFrom() { return sourcesOf(node, 'same').filter((alias) => alias.as !== 'result'); }, get elements() { return resultElements(node); } };
      }
      if (api.isTaggedTemplateExpression(node)) {
        const template = node.template;
        const substitutions = api.isTemplateExpression(template) ? template.templateSpans.map((span) => part(span.expression)) : [];
        return { ...base, kind: 'call', callee: part(node.tag), arguments: [part(template), ...substitutions], hasSpread: false, madeFrom: [], elements: 'unknown' };
      }
      if (api.isTemplateExpression(node) && !api.isTaggedTemplateExpression(node.parent)) {
        return { ...base, kind: 'template', parts: node.templateSpans.map((span) => part(span.expression)) };
      }
      if (api.isNewExpression(node)) {
        return { ...base, kind: 'new', callee: part(unwrapped(node.expression)), argumentCount: node.arguments?.length ?? 0, arguments: (node.arguments ?? []).map(part), hasSpread: (node.arguments ?? []).some(api.isSpreadElement), get madeFrom() { return sourcesOf(node, 'same'); } };
      }
      if (api.isVariableStatement(node) && api.isSourceFile(node.parent) && (node.declarationList.flags & api.NodeFlags.Const) === 0) {
        const ambient = (api.getModifiers(node) ?? []).some((modifier) => modifier.kind === api.SyntaxKind.DeclareKeyword);
        if (!ambient) return { ...base, kind: 'module-state' };
      }
      if (api.isPropertyAccessExpression(node)) {
        return {
          ...base,
          kind: 'property-access',
          object: part(unwrapped(node.expression)),
          name: node.name.text,
          get isNarrowed() {
            return narrowed(node.name);
          },
          get takesDeclared() {
            return takesDeclared(node.name);
          },
          get isGetter() {
            return ((checker.getSymbolAtLocation(node.name)?.flags ?? 0) & api.SymbolFlags.GetAccessor) !== 0;
          },
          get elements() {
            return elementsOf(declaredType(checker.getSymbolAtLocation(node.name)));
          },
          get holds() {
            for (const declaration of checker.getSymbolAtLocation(node.name)?.declarations ?? []) {
              if (!isChecked(declaration.getSourceFile())) continue;
              if (!api.isPropertySignature(declaration) && !api.isPropertyDeclaration(declaration) && !api.isParameter(declaration)) continue;
              if (declaration.type !== undefined) return mentionsMut(declaration.type) || isUnderMut(declaration.type) ? 'writable' : 'readonly';
              return api.isPropertyDeclaration(declaration) && isMadeInPlace(declaration.initializer) ? 'writable' : 'readonly';
            }
            return 'unknown';
          },
          get getterIn() {
            const getter = (checker.getSymbolAtLocation(node.name)?.declarations ?? []).find((declaration) => api.isGetAccessor(declaration));
            const fileName = getter?.getSourceFile().fileName;
            return fileName !== undefined && fileName.startsWith(root) && !fileName.includes('/node_modules/') ? fileName.slice(root.length) : undefined;
          },
          get method() {
            const declarations = checker.getSymbolAtLocation(node.name)?.declarations ?? [];
            const written = declarations.find((declaration) => api.isMethodDeclaration(declaration) || api.isMethodSignature(declaration));
            if (written === undefined) return undefined;
            const owner = written.parent;
            return (api.isClassLike(owner) || api.isInterfaceDeclaration(owner)) && owner.name !== undefined ? owner.name.text : '';
          },
        };
      }
      if (api.isElementAccessExpression(node)) {
        return { ...base, kind: 'element-access', object: part(unwrapped(node.expression)), index: part(unwrapped(node.argumentExpression)) };
      }
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
        const isPattern = node.operatorToken.kind === api.SyntaxKind.EqualsToken && (api.isObjectLiteralExpression(node.left) || api.isArrayLiteralExpression(node.left));
        return {
          ...base,
          kind: 'binary',
          operator: api.tokenToString(node.operatorToken.kind) ?? '',
          left: part(unwrapped(node.left)),
          right: part(unwrapped(node.right)),
          get hiddenDefaults() {
            return isPattern ? assignedDefaults(node.left, checker.getTypeAtLocation(node.right)).map(part) : [];
          },
        };
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
      if (api.isConditionalExpression(node)) return { ...base, kind: 'conditional', whenTrue: part(unwrapped(node.whenTrue)), whenFalse: part(unwrapped(node.whenFalse)) };
      if (api.isObjectLiteralExpression(node)) {
        // In the order written: a spread writes over what comes before it, and is written over by what comes after.
        const entries = node.properties.map((member) =>
          api.isSpreadAssignment(member)
            ? { name: undefined, key: undefined, spread: part(unwrapped(member.expression)) }
            : {
                name: member.name !== undefined && (api.isIdentifier(member.name) || api.isStringLiteralLike(member.name)) ? member.name.text : undefined,
                key: member.name !== undefined && api.isComputedPropertyName(member.name) ? part(unwrapped(member.name.expression)) : undefined,
                spread: undefined,
              },
        );
        return { ...base, kind: 'literal', entries, get madeFrom() { return sourcesOf(node, 'same'); }, get spreadFrom() { return node.properties.flatMap((member) => (api.isSpreadAssignment(member) ? sourcesOf(member.expression, 'copy') : [])); } };
      }
      if (api.isArrayLiteralExpression(node)) return { ...base, kind: 'literal', entries: [], get madeFrom() { return sourcesOf(node, 'same'); }, get spreadFrom() { return node.elements.flatMap((element) => (api.isSpreadElement(element) ? sourcesOf(element.expression, 'copy') : [])); } };
      if (api.isBlock(node) || api.isSourceFile(node) || api.isModuleBlock(node)) return { ...base, kind: 'block' };
      if (api.isVariableStatement(node) || api.isVariableDeclarationList(node) || api.isParenthesizedExpression(node)) return { ...base, kind: 'sequence' };
      if (api.isVariableDeclaration(node)) {
        const list = node.parent;
        const isConst = api.isVariableDeclarationList(list) && (list.flags & api.NodeFlags.Const) !== 0;
        // Not the variable of a loop or of a `catch`, which gets its value there; not one under `declare`.
        const isDeclared = api.isVariableDeclarationList(list) && api.isVariableStatement(list.parent) && (api.getCombinedModifierFlags(node) & api.ModifierFlags.Ambient) !== 0;
        const waitsForValue = node.initializer === undefined && api.isVariableDeclarationList(list) && api.isVariableStatement(list.parent) && !isDeclared;
        return { ...base, kind: 'variable', name: part(node.name), isConst, initializer: node.initializer === undefined ? undefined : part(node.initializer), waitsForValue, hiddenDefaults: hiddenDefaults(node).map(part) };
      }
      // `super.method()` is called on the object itself.
      if (node.kind === api.SyntaxKind.ThisKeyword || (node.kind === api.SyntaxKind.SuperKeyword && api.isPropertyAccessExpression(node.parent))) {
        return {
          ...base,
          kind: 'this',
          get receiver() {
            // A function written with an arrow has the `this` of where it is written.
            let throughArrow = false;
            for (let outer: ts.Node | undefined = node.parent; outer !== undefined; outer = outer.parent) {
              if (api.isArrowFunction(outer)) throughArrow = true;
              // A function written with an arrow in a constructor runs when it is called, which may be later.
              else if (api.isConstructorDeclaration(outer)) return throughArrow ? 'readonly' : 'mutable';
              else if (api.isSetAccessor(outer) || api.isClassStaticBlockDeclaration(outer)) return 'mutable';
              // The value a property is declared with runs while the object is made; a function kept there runs later.
              else if (api.isPropertyDeclaration(outer)) return throughArrow ? 'readonly' : 'mutable';
              else if (api.isFunctionLike(outer)) return isMut(outer.parameters.find(isThis)?.type) ? 'mutable' : 'readonly';
            }
            return 'mutable';
          },
        };
      }
      if (api.isIterationStatement(node, false)) {
        const once = api.isForOfStatement(node) || api.isForInStatement(node) ? node.expression : api.isForStatement(node) ? node.initializer : undefined;
        const written = (api.isForOfStatement(node) || api.isForInStatement(node)) && !api.isVariableDeclarationList(node.initializer) ? node.initializer : undefined;
        return { ...base, kind: 'loop', once: once === undefined ? undefined : part(once), target: written === undefined ? undefined : part(unwrapped(written)) };
      }
      if (api.isMethodSignature(node)) return { ...base, kind: 'method-signature' };
      if (api.isEnumDeclaration(node)) {
        const isText = (member: ts.EnumMember): boolean => member.initializer !== undefined && api.isStringLiteralLike(member.initializer);
        return { ...base, kind: 'enum', isNumeric: !node.members.every(isText) };
      }
      if (api.isFunctionLike(node) && !api.isTypeNode(node) && !api.isTypeElement(node)) {
        // The function-likes that are written with a body: a signature of a type has none.
        const body = api.isFunctionDeclaration(node) || api.isMethodDeclaration(node) || api.isConstructorDeclaration(node) || api.isAccessor(node) || api.isFunctionExpression(node) || api.isArrowFunction(node) ? node.body : undefined;
        const declares = api.isFunctionDeclaration(node) || api.isMethodDeclaration(node) || api.isConstructorDeclaration(node);
        const isAbstract = (api.getCombinedModifierFlags(node) & api.ModifierFlags.Abstract) !== 0;
        // Under `declare`, a signature with no body says what is defined elsewhere: `no-ambient` answers for it.
        const isDeclared =
          api.findAncestor(node, (outer) => api.canHaveModifiers(outer) && (api.getModifiers(outer) ?? []).some((modifier) => modifier.kind === api.SyntaxKind.DeclareKeyword)) !== undefined;
        const isOverload = declares && body === undefined && !isAbstract && !isDeclared;
        return { ...base, kind: 'function', hiddenDefaults: node.parameters.flatMap(hiddenDefaults).map(part), parameters: node.parameters.map((parameter) => part(parameter.name)), body: body === undefined ? undefined : part(body), isOverload, isConstructor: api.isConstructorDeclaration(node), name: node.name !== undefined && (api.isIdentifier(node.name) || api.isStringLiteralLike(node.name)) ? node.name.text : undefined, get overridden() { return overriddenBy(node); } };
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
    mutableProperties: [],
    optionalProperties: [],
    propertyNames: [],
    isPlain: false,
    kinds: ['object'],
    isPromise: false,
    isArray: false,
    isTuple: false,
    isIndexed: false,
    isClass: false,
    get members() {
      return [unknownOrigin];
    },
    get awaited() {
      return unknownOrigin;
    },
    property: () => undefined,
    properties: [],
    element: undefined,
    returns: [],
    mutableParameters: [],
    isWrittenInProject: false,
    defaultedParameters: [],
    undefinedParameters: [],
    isImplemented: false,
    mutableReturn: false,
    mutableReceiver: undefined,
  };

  /**
   * Whether an expression is given where mutation is asked for. A place that says `Mut<…>` asks it of everything
   * that is put in it: of each property and element of what is written in place there, of what is pushed into it.
   */
  /**
   * The type written for the place an expression is given to, when one is: the variable it starts, the parameter
   * it is an argument of, what the function it is returned from says it gives, the property or the position it
   * fills in something written in place.
   */
  const wantedOf = (source: ts.Expression): ts.TypeNode | undefined => {
    // The expression that is given: what is chosen between (`a ?? b`, `c ? a : b`) is given where the choice is.
    let place: ts.Node = source;
    for (;;) {
      const outer: ts.Node = place.parent;
      const chooses =
        api.isParenthesizedExpression(outer) ||
        api.isNonNullExpression(outer) ||
        (api.isConditionalExpression(outer) && outer.condition !== place) ||
        (api.isBinaryExpression(outer) && [api.SyntaxKind.QuestionQuestionToken, api.SyntaxKind.BarBarToken].includes(outer.operatorToken.kind));
      if (!chooses) break;
      place = outer;
    }
    const holder = place.parent;
    if (api.isVariableDeclaration(holder)) return holder.initializer === place ? holder.type : undefined;
    if (api.isReturnStatement(holder) || (api.isArrowFunction(holder) && holder.body === place)) {
      let owner: ts.Node | undefined = holder;
      while (owner !== undefined && !api.isFunctionLike(owner)) owner = owner.parent;
      return owner !== undefined && api.isFunctionLike(owner) ? owner.type : undefined;
    }
    if (api.isCallExpression(holder) || api.isNewExpression(holder)) {
      const index = (holder.arguments ?? []).findIndex((argument) => argument === place);
      if (index === -1) return undefined;
      const parameters = checker.getResolvedSignature(holder)?.getParameters() ?? [];
      // Past the last one, an argument goes to the rest of them.
      const declaration = (parameters[index] ?? parameters.at(-1))?.valueDeclaration;
      return declaration !== undefined && api.isParameter(declaration) ? declaration.type : undefined;
    }
    // A property of an object written in place: what the type the object is asked to have declares for it.
    if ((api.isPropertyAssignment(holder) && holder.initializer === place) || api.isShorthandPropertyAssignment(holder)) {
      const name = holder.name;
      const wanted = checker.getContextualType(holder.parent);
      if (wanted === undefined || !(api.isIdentifier(name) || api.isStringLiteralLike(name))) return undefined;
      return (wanted.isUnion() ? wanted.types : [wanted]).flatMap((member) => declaredType(member.getProperty(name.text)) ?? [])[0];
    }
    // The right side of an assignment to a name or a property: what the left side was declared as.
    if (api.isBinaryExpression(holder) && holder.operatorToken.kind === api.SyntaxKind.EqualsToken && holder.right === place && !api.isElementAccessExpression(holder.left)) {
      const left = holder.left;
      return declaredType(checker.getSymbolAtLocation(api.isPropertyAccessExpression(left) ? left.name : left));
    }
    // An element of an array written in place: what the type written for the array says it holds.
    if (api.isArrayLiteralExpression(holder) || (api.isSpreadElement(holder) && api.isArrayLiteralExpression(holder.parent))) {
      const list = wantedOf(api.isSpreadElement(holder) ? holder.parent : holder);
      const inner = list === undefined ? undefined : peeled(list);
      if (inner === undefined) return undefined;
      if (api.isArrayTypeNode(inner)) return inner.elementType;
      return api.isTypeReferenceNode(inner) && api.isIdentifier(inner.typeName) && ['Array', 'ReadonlyArray'].includes(inner.typeName.text) ? inner.typeArguments?.[0] : undefined;
    }
    // What is spread into an object written in place goes where the object goes.
    if (api.isSpreadAssignment(holder) && api.isObjectLiteralExpression(holder.parent)) return wantedOf(holder.parent);
    return undefined;
  };

  /**
   * Whether an expression is given where mutation is asked for: the type written for the place says `Mut<…>`. A
   * list that says `Mut<…>` around itself and not inside asks nothing of what is put in it: it is the list that
   * may be written. One whose type says it inside, or a field with no written type, asks it of what `push` and
   * its kin are given.
   */
  const asksOf = (source: ts.Expression): boolean => {
    // What is spread is copied, one level: it is the object or the array written around it that is given.
    let spread: ts.Node = source;
    for (;;) {
      const outer: ts.Node = spread.parent;
      const chooses = api.isBinaryExpression(outer) && [api.SyntaxKind.QuestionQuestionToken, api.SyntaxKind.BarBarToken, api.SyntaxKind.AmpersandAmpersandToken].includes(outer.operatorToken.kind);
      const branch = api.isConditionalExpression(outer) && outer.condition !== spread;
      if (!api.isParenthesizedExpression(outer) && !api.isNonNullExpression(outer) && !chooses && !branch) break;
      spread = outer;
    }
    if (api.isSpreadAssignment(spread.parent) || api.isSpreadElement(spread.parent)) return false;
    if (mentionsMut(wantedOf(source))) return true;
    let place: ts.Node = source;
    while (api.isParenthesizedExpression(place.parent) || api.isNonNullExpression(place.parent)) place = place.parent;
    const holder = place.parent;
    /** Whether what a container holds may be written into, as it is named here. */
    const holdsWritable = (container: ts.Expression): boolean => {
      let named = container;
      while (api.isParenthesizedExpression(named) || api.isNonNullExpression(named)) named = named.expression;
      // A local with no written type is followed by what is put in it, and asks nothing here.
      if (api.isIdentifier(named)) return elementsOf(declaredType(checker.getSymbolAtLocation(named))) === 'writable';
      if (!api.isPropertyAccessExpression(named)) return false;
      const symbol = checker.getSymbolAtLocation(named.name);
      const fromProject = (symbol?.declarations ?? []).some((declaration) => isChecked(declaration.getSourceFile()));
      // A field of the project with no written type holds what it holds, written or not: nothing says.
      return fromProject && elementsOf(declaredType(symbol)) !== 'readonly';
    };
    if (api.isCallExpression(holder) && api.isPropertyAccessExpression(holder.expression) && STORES.includes(holder.expression.name.text) && holder.arguments.some((argument) => argument === place)) {
      return holdsWritable(holder.expression.expression);
    }
    if (api.isBinaryExpression(holder) && holder.operatorToken.kind === api.SyntaxKind.EqualsToken && holder.right === place && api.isElementAccessExpression(holder.left)) {
      return holdsWritable(holder.left.expression);
    }
    return false;
  };

  return {
    files,
    declarationFiles,
    get imports() {
      // An import of types only is erased: it makes no file run.
      const forValues = (statement: ts.Statement): ts.Expression | undefined => {
        if (api.isImportDeclaration(statement)) return statement.importClause?.isTypeOnly === true ? undefined : statement.moduleSpecifier;
        if (api.isExportDeclaration(statement)) return statement.isTypeOnly ? undefined : statement.moduleSpecifier;
        return undefined;
      };
      return record(
        program
          .getSourceFiles()
          .filter(isChecked)
          .map((sourceFile): readonly [string, readonly string[]] => [
            displayName(sourceFile.fileName),
            sourceFile.statements.flatMap((statement) => {
              const specifier = forValues(statement);
              const target = specifier === undefined ? undefined : checker.getSymbolAtLocation(specifier)?.valueDeclaration;
              return target !== undefined && api.isSourceFile(target) && isChecked(target) ? [displayName(target.fileName)] : [];
            }),
          ]),
      );
    },
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
      if (source === undefined || !api.isExpression(source) || isNameOfMember(source)) return undefined;
      const expected = checker.getContextualType(source);
      return expected === undefined ? undefined : wrapType(expected);
    },
    isWidened: (node) => {
      const source = origin.get(node);
      if (source === undefined || !api.isExpression(source) || isNameOfMember(source)) return false;
      const expected = checker.getContextualType(source);
      // Without the `undefined` of an optional place: nothing is written through it, and the value given is not it.
      if (expected === undefined) return false;
      const asked = checker.getNonNullableType(expected);
      // What an `async` function returns is asked for as the value or a promise of it: the value is what is given.
      return widens(asked.isUnion() ? (checker.getAwaitedType(asked) ?? asked) : asked, checker.getTypeAtLocation(source), 0);
    },
    valuesOf: (node) => {
      const source = origin.get(node);
      return source === undefined || !api.isExpression(source) ? undefined : valuesOf(source, 0);
    },
    asksForMutation: (node) => {
      const source = origin.get(node);
      return source !== undefined && api.isExpression(source) && asksOf(source);
    },
    asksForMutationInside: (node) => {
      const source = origin.get(node);
      return source !== undefined && api.isExpression(source) && saysMutInside(wantedOf(source));
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
  const rootOf = `${rootDir.replace(/\\/g, '/').replace(/\/+$/, '')}/`;
  return (call) => {
    const declaration = checker.getResolvedSignature(call)?.declaration;
    if (declaration === undefined && api.isNewExpression(call)) {
      // A class with no constructor written: there is no signature to find, and the class itself says where it is.
      const named = checker.getSymbolAtLocation(call.expression);
      const built = (named !== undefined && (named.flags & api.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(named) : named)?.valueDeclaration;
      if (built === undefined || !api.isClassLike(built)) return undefined;
      const file = built.getSourceFile();
      const inProject = checked.has(file.fileName);
      return {
        name: `${built.name?.text ?? ''}.new`,
        origin: inProject ? { kind: 'project' } : program.isSourceFileDefaultLibrary(file) ? { kind: 'library' } : { kind: 'package', package: packageOf(file.fileName) },
        ...(inProject && file.fileName.startsWith(rootOf) ? { declaredIn: file.fileName.slice(rootOf.length) } : {}),
      };
    }
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
      ...(origin.kind === 'project' && file.fileName.startsWith(rootOf) ? { declaredIn: file.fileName.slice(rootOf.length) } : {}),
    };
  };
}
