// Reads the compiler's own declarations of the JavaScript standard library: every function, method and constructor,
// under the name the rules know it by, with the types of its parameters as descriptions a generator can follow.
import ts from '@typescript/typescript6';

export const TYPED_ARRAYS = ['Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array'];
export const NATIVE_ERRORS = ['EvalError', 'RangeError', 'ReferenceError', 'SyntaxError', 'TypeError', 'URIError'];

/** The owners whose functions are run. The rest is listed, not run: `Intl`, which another specification defines, and
 * the interfaces a caller implements (a proxy handler, an iterator, a property descriptor). */
export const RUNNABLE = new Set([
  'String', 'StringConstructor', 'Number', 'NumberConstructor', 'Boolean', 'BooleanConstructor', 'BigInt', 'BigIntConstructor',
  'Symbol', 'SymbolConstructor', 'Array', 'ReadonlyArray', 'ArrayConstructor', 'Object', 'ObjectConstructor', 'Math', 'JSON',
  'Date', 'DateConstructor', 'RegExp', 'RegExpConstructor', 'Map', 'ReadonlyMap', 'MapConstructor', 'Set', 'ReadonlySet',
  'SetConstructor', 'WeakMap', 'WeakMapConstructor', 'WeakSet', 'WeakSetConstructor', 'Promise', 'PromiseConstructor',
  'Error', 'ErrorConstructor', 'Reflect', 'CallableFunction', 'NewableFunction', 'Function', '',
  ...TYPED_ARRAYS.flatMap((name) => [name, `${name}Constructor`]),
  ...NATIVE_ERRORS.map((name) => `${name}Constructor`), 'AggregateErrorConstructor',
  'ArrayBuffer', 'ArrayBufferConstructor', 'SharedArrayBuffer', 'SharedArrayBufferConstructor', 'DataView', 'DataViewConstructor',
  'Atomics', 'Generator', 'AsyncGenerator', 'WeakRef', 'WeakRefConstructor', 'FinalizationRegistry', 'FinalizationRegistryConstructor',
]);
/** Never run, whatever their owner: they execute text. */
const NEVER = new Set(['eval', 'FunctionConstructor.new', 'FunctionConstructor.', 'Function.new']);

const MAX_DEPTH = 3;

/**
 * A type as a generator needs it. `any` stands for a value whose type says nothing (any, unknown, a type parameter,
 * `object`, `{}`): the generator fills it from a pool, plain or not.
 */
function describe(checker, type, depth) {
  const f = type.flags;
  const F = ts.TypeFlags;
  if (depth > MAX_DEPTH) return { k: 'any' };
  if (f & F.TypeParameter) {
    // A type parameter accepts what its constraint accepts: `K extends WeakKey` is not any value.
    const constraint = checker.getBaseConstraintOfType(type);
    return constraint === undefined || constraint === type || constraint.flags & (F.Any | F.Unknown) ? { k: 'any' } : describe(checker, constraint, depth + 1);
  }
  // `object`: anything but a primitive, and neither null nor undefined.
  if (f & F.NonPrimitive) return { k: 'objectLike' };
  if (f & (F.Any | F.Unknown | F.Never | F.Index | F.IndexedAccess | F.Conditional | F.Substitution)) return { k: 'any' };
  if (type.isStringLiteral() || type.isNumberLiteral()) return { k: 'literal', v: type.value };
  if (f & F.BooleanLiteral) return { k: 'literal', v: checker.typeToString(type) === 'true' };
  if (f & F.StringLike) return { k: 'string' };
  if (f & F.NumberLike) return { k: 'number' };
  if (f & F.BooleanLike) return { k: 'boolean' };
  if (f & F.BigIntLike) return { k: 'bigint' };
  if (f & F.ESSymbolLike) return { k: 'symbol' };
  if (f & (F.Undefined | F.Void)) return { k: 'undefined' };
  if (f & F.Null) return { k: 'null' };
  if (type.isUnion()) return { k: 'union', of: type.types.slice(0, 6).map((member) => describe(checker, member, depth + 1)) };
  if (type.isIntersection()) return describe(checker, type.types[0], depth + 1);
  if (checker.isTupleType(type)) return { k: 'tuple', of: checker.getTypeArguments(type).map((item) => describe(checker, item, depth + 1)) };
  if (checker.isArrayType(type)) return { k: 'array', of: describe(checker, checker.getTypeArguments(type)[0], depth + 1) };
  // A class, or anything `new` works on.
  if (type.getConstructSignatures().length > 0 && type.getCallSignatures().length === 0) return { k: 'library', name: 'NewableFunction' };
  const signatures = type.getCallSignatures();
  if (signatures.length > 0) {
    const signature = signatures[0];
    return { k: 'function', arity: signature.parameters.length, returns: describe(checker, signature.getReturnType(), depth + 1) };
  }
  const name = type.getSymbol()?.getName();
  const inLibrary = (type.getSymbol()?.getDeclarations() ?? []).some((declaration) => declaration.getSourceFile().isDeclarationFile);
  if (inLibrary && name !== undefined && name !== '__type' && name !== '__object') {
    const [first, second] = (type.flags & F.Object) !== 0 && (type.objectFlags & ts.ObjectFlags.Reference) !== 0 ? checker.getTypeArguments(type) : [];
    return {
      k: 'library',
      name,
      ...(first === undefined ? {} : { of: describe(checker, first, depth + 1) }),
      ...(second === undefined ? {} : { and: describe(checker, second, depth + 1) }),
    };
  }
  const props = {};
  for (const property of type.getProperties().slice(0, 12)) {
    if (property.getName().startsWith('__@')) continue;
    props[property.getName()] = { optional: (property.flags & ts.SymbolFlags.Optional) !== 0, type: describe(checker, checker.getTypeOfSymbol(property), depth + 1) };
  }
  return { k: 'object', props };
}

/** Every callable declaration of the ES libraries: `{ name, owner, member, runnable, signatures }`. */
export function readLibrary() {
  const options = { target: ts.ScriptTarget.ES2023, lib: ['lib.es2023.d.ts'], types: [], noEmit: true, strict: true };
  const host = ts.createCompilerHost(options);
  const probe = '/__ledger__.ts';
  const program = ts.createProgram({
    rootNames: [probe],
    options,
    host: {
      ...host,
      fileExists: (name) => name === probe || host.fileExists(name),
      readFile: (name) => (name === probe ? 'export {};' : host.readFile(name)),
      getSourceFile: (name, version, onError, create) => (name === probe ? ts.createSourceFile(name, 'export {};', version, true) : host.getSourceFile(name, version, onError, create)),
    },
  });
  const checker = program.getTypeChecker();
  const found = new Map();

  const add = (owner, member, declaration) => {
    const name = owner === '' ? member : `${owner}.${member}`;
    const parameters = declaration.parameters.filter((parameter) => !(ts.isIdentifier(parameter.name) && parameter.name.text === 'this'));
    const described = {
      params: parameters.map((parameter) => {
        const type = checker.getTypeAtLocation(parameter);
        const rest = parameter.dotDotDotToken !== undefined;
        const item = rest && checker.isArrayType(type) ? checker.getTypeArguments(type)[0] : type;
        const optional = parameter.questionToken !== undefined || parameter.initializer !== undefined;
        const described = describe(checker, item, 0);
        // An optional parameter is left out, not given `undefined`: the compiler adds that member itself.
        const given = optional && described.k === 'union' ? { k: 'union', of: described.of.filter((member) => member.k !== 'undefined') } : described;
        return { optional, rest, type: given.k === 'union' && given.of.length === 1 ? given.of[0] : given };
      }),
    };
    const entry = found.get(name) ?? { name, owner, member, runnable: RUNNABLE.has(owner) && !NEVER.has(name), signatures: [] };
    entry.signatures.push(described);
    found.set(name, entry);
  };
  const members = (owner, list) => {
    for (const member of list) {
      if (ts.isMethodSignature(member) && member.name !== undefined && (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name))) add(owner, member.name.text, member);
      else if (ts.isConstructSignatureDeclaration(member)) add(owner, 'new', member);
      else if (ts.isCallSignatureDeclaration(member)) add(owner, '', member);
    }
  };
  const visit = (statement) => {
    if (ts.isInterfaceDeclaration(statement)) members(statement.name.text, statement.members);
    else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.type !== undefined && ts.isTypeLiteralNode(declaration.type)) members(declaration.name.text, declaration.type.members);
      }
    } else if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) add('', statement.name.text, statement);
    else if (ts.isModuleDeclaration(statement) && ts.isIdentifier(statement.name) && statement.body !== undefined && ts.isModuleBlock(statement.body)) {
      for (const inner of statement.body.statements) {
        if (ts.isFunctionDeclaration(inner) && inner.name !== undefined) add(statement.name.text, inner.name.text, inner);
      }
    }
  };
  for (const sourceFile of program.getSourceFiles()) {
    if (!program.isSourceFileDefaultLibrary(sourceFile) || !/lib\.es[\w.]*\.d\.ts$/.test(sourceFile.fileName)) continue;
    sourceFile.statements.forEach(visit);
  }
  return [...found.values()].toSorted((a, b) => (a.name < b.name ? -1 : 1));
}
