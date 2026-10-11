// Reads the ECMAScript specification, as its authors write it (ecmarkup), and derives which built-in functions can
// throw. In the specification every step that may fail says so: `throw a *RangeError* exception`, or a call marked
// `?`, which hands the callee's failure on. Following those marks from a function gives every way it can throw.
//
// Not every such way concerns typed code. A step that throws when `this` is not the right kind of object, or when
// a callback is not callable, cannot be reached by a call the compiler accepted. The lists below say which marks
// are of that kind. They are the judgement in this file, and what `build.mjs` checks against the runs.

/** Splits the document into its clauses: `{ id, attributes, header, algorithms }`, each with its own text only. */
export function clauses(html) {
  const found = [];
  const stack = [];
  const tag = /<(emu-clause|emu-annex)\b([^>]*)>|<\/(emu-clause|emu-annex)>/g;
  let last = 0;
  for (let match = tag.exec(html); match !== null; match = tag.exec(html)) {
    const top = stack.at(-1);
    if (top !== undefined) top.text += html.slice(last, match.index);
    last = tag.lastIndex;
    if (match[1] !== undefined) {
      stack.push({ id: /\bid="([^"]+)"/.exec(match[2])?.[1] ?? '', attributes: match[2], text: '' });
    } else {
      const closed = stack.pop();
      if (closed === undefined) continue;
      const header = /<h1>([\s\S]*?)<\/h1>/.exec(closed.text)?.[1] ?? '';
      found.push({
        id: closed.id,
        attributes: closed.attributes,
        header: header.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
        algorithms: [...closed.text.matchAll(/<emu-alg[^>]*>([\s\S]*?)<\/emu-alg>/g)].map((alg) => alg[1]),
      });
    }
  }
  return found;
}

/**
 * The facts of each clause that has an algorithm: its name, whether its header says it can throw, the steps that
 * throw, and the operations it calls with `?`.
 */
export function facts(html) {
  return clauses(html)
    .filter((clause) => clause.algorithms.length > 0 && clause.header.includes('('))
    .map((clause) => {
      const steps = clause.algorithms.flatMap((alg) => alg.split('\n').map((line) => line.trim()).filter((line) => line !== ''));
      const throws = steps.flatMap((step) => [...step.matchAll(/throw an? \*(\w+)\* exception/g)].map((thrown) => ({ kind: thrown[1], step: step.replace(/^\d+\.\s*/, '') })));
      const calls = new Set();
      for (const step of steps) {
        // `? ToObject(*this* value)` fails on a wrong receiver, which types exclude; `? ToObject(_value_)` on an argument.
        for (const call of step.matchAll(/\? ([A-Za-z%][\w.%]*)\((\*this\* value)?/g)) calls.add(call[2] === undefined ? call[1] : `${call[1]}:this`);
        for (const call of step.matchAll(/\? _\w+_\.\[\[(\w+)\]\]\(/g)) calls.add(`[[${call[1]}]]`);
      }
      return {
        id: clause.id,
        name: clause.header.slice(0, clause.header.indexOf('(')).trim(),
        operation: /type="[^"]*abstract operation/.test(clause.attributes) || /type="[^"]*(?:host-defined|implementation-defined)/.test(clause.attributes),
        throws,
        calls: [...calls].toSorted(),
      };
    });
}

// ── What a mark means for typed code ───────────────────────────────

/**
 * Operations whose failure a typed call cannot reach: they throw when `this` or an argument is not the kind of
 * object the types require, or they run code the caller wrote (a callback, a getter, a proxy), which in conforming
 * code does not throw.
 */
const UNREACHABLE = new Set([
  'Call', 'Construct', 'Invoke', 'Get', 'GetV', 'GetMethod', 'Set', 'HasProperty', 'HasOwnProperty', 'DeletePropertyOrThrow',
  'CreateDataProperty', 'CreateDataPropertyOrThrow', 'DefinePropertyOrThrow', 'LengthOfArrayLike',
  'RequireInternalSlot', 'OrdinaryCreateFromConstructor', 'GetPrototypeFromConstructor', 'SpeciesConstructor', 'ArraySpeciesCreate',
  'IsArray', 'GetIterator', 'IteratorStep', 'IteratorNext', 'IteratorValue', 'IteratorClose', 'IteratorComplete', 'IterableToList',
  'thisNumberValue', 'thisStringValue', 'thisBooleanValue', 'thisBigIntValue', 'thisSymbolValue', 'thisTimeValue',
  'EnumerableOwnProperties', 'OrdinaryHasInstance', 'InstanceofOperator', 'NewPromiseCapability', 'PromiseResolve',
  'IsRegExp', 'IsConcatSpreadable', 'RegExpExec', 'RegExpBuiltinExec', 'OrdinaryObjectCreate',
  'IsExtensible', 'TestIntegrityLevel', 'GetFunctionRealm', 'IsLooselyEqual',
  'IsStrictlyEqual', 'SameValueZero', 'SameValue', 'ToBoolean', 'CanonicalNumericIndexString', 'IsIntegralNumber',
]);
/**
 * Conversions: they throw on a value of the wrong kind for them (a symbol, null, an object whose conversion fails).
 * Whether a typed call can give them such a value depends on the types of the parameters, which the runs decide.
 */
const CONVERSIONS = new Set([
  'ToString', 'ToNumber', 'ToNumeric', 'ToPrimitive', 'OrdinaryToPrimitive', 'ToIntegerOrInfinity', 'ToLength', 'ToInt32', 'ToUint32',
  'ToInt16', 'ToUint16', 'ToInt8', 'ToUint8', 'ToUint8Clamp', 'ToPropertyKey', 'ToPropertyDescriptor', 'ToObject', 'RequireObjectCoercible',
  'CreateListFromArrayLike',
]);

/** A step that throws because a value is not of the type the declarations require. */
const TYPE_GUARD = [
  /is not an Object/, /is not a (?:String|Number|BigInt|Boolean)\b/, /IsCallable\([^)]*\) is \*false\*/, /IsConstructor\([^)]*\) is \*false\*/,
  /does not have an? \[\[/, /is (?:either )?\*undefined\* or \*null\*/, /NewTarget is (?:not )?\*undefined\*/, /is not callable/,
  /is not a Symbol/, /IsPromise\([^)]*\) is \*false\*/, /_status_ is \*false\*/,
  /is not a constructor/, /\bis \*true\*, throw a \*TypeError\*.*IsRegExp|_isRegExp_ is \*true\*/,
];
/** A step that throws on a value that cannot be converted. */
const CONVERSION_GUARD = [/is a Symbol/, /is an? (?:BigInt|Symbol), throw a \*TypeError\*/];
/** A step that throws past a size no machine holds. */
const SIZE_LIMIT = [/2<sup>53<\/sup>/, /2\*\*53/, /2<sup>32<\/sup>/];

/**
 * How a clause can throw on a typed call: `real` reasons (a kind of error, with where it comes from), and whether
 * it can also throw on a value that cannot be converted.
 */
export function analyse(all) {
  const byName = new Map(all.map((clause) => [clause.name, clause]));
  const known = new Map();
  const visit = (clause, path) => {
    if (known.has(clause.name)) return known.get(clause.name);
    if (path.includes(clause.name)) return { real: [], converts: false };
    const real = [];
    let converts = false;
    for (const thrown of clause.throws) {
      if (TYPE_GUARD.some((pattern) => pattern.test(thrown.step)) || SIZE_LIMIT.some((pattern) => pattern.test(thrown.step))) continue;
      if (CONVERSION_GUARD.some((pattern) => pattern.test(thrown.step))) converts = true;
      else real.push(`${thrown.kind}: ${thrown.step.replace(/<[^>]+>/g, '').slice(0, 110)}`);
    }
    for (const written of clause.calls) {
      // On `this`, any of these fails only on a receiver the types exclude.
      if (written.endsWith(':this')) continue;
      const called = written;
      if (UNREACHABLE.has(called) || called.startsWith('[[')) continue;
      if (CONVERSIONS.has(called)) {
        converts = true;
        continue;
      }
      const callee = byName.get(called);
      // An operation this reader does not know may throw: nothing says otherwise.
      if (callee === undefined) {
        real.push(`? ${called}`);
        continue;
      }
      const inner = visit(callee, [...path, clause.name]);
      converts ||= inner.converts;
      for (const reason of inner.real) real.push(reason.startsWith('via ') ? reason : `via ${called}: ${reason}`);
    }
    const result = { real: [...new Set(real)].slice(0, 4), converts };
    known.set(clause.name, result);
    return result;
  };
  return new Map(all.filter((clause) => !clause.operation).map((clause) => [clause.name, { id: clause.id, ...visit(clause, []) }]));
}

/** The names the compiler's declarations give to a function of the specification. */
export function declaredNames(specName) {
  // Functions the specification defines by pointing at another one.
  const same = { parseFloat: ['NumberConstructor.parseFloat'], parseInt: ['NumberConstructor.parseInt'], 'Set.prototype.values': ['Set.keys', 'ReadonlySet.keys'] };
  return [...namesOf(specName), ...(same[specName] ?? [])];
}

function namesOf(specName) {
  const constructors = ['String', 'Number', 'Boolean', 'BigInt', 'Symbol', 'Array', 'Object', 'Date', 'RegExp', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Error', 'Function'];
  const readonly = { Array: 'ReadonlyArray', Map: 'ReadonlyMap', Set: 'ReadonlySet' };
  const method = /^(\w+)\.prototype\.(\w+)$/.exec(specName);
  if (method !== null) {
    const [, owner, member] = method;
    if (owner === 'Function') return [`CallableFunction.${member}`, `NewableFunction.${member}`, `Function.${member}`];
    return [`${owner}.${member}`, ...(readonly[owner] === undefined ? [] : [`${readonly[owner]}.${member}`])];
  }
  const fixed = /^(\w+)\.(\w+)$/.exec(specName);
  if (fixed !== null) return [constructors.includes(fixed[1]) ? `${fixed[1]}Constructor.${fixed[2]}` : `${fixed[1]}.${fixed[2]}`];
  if (/^\w+$/.test(specName)) return constructors.includes(specName) ? [`${specName}Constructor.`, `${specName}Constructor.new`] : [specName];
  return [];
}
