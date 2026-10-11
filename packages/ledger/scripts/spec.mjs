// Reads the ECMAScript specification, as its authors write it (ecmarkup), and derives which built-in functions can
// throw. In the specification every step that may fail says so: `throw a *RangeError* exception`, or a call marked
// `?`, which hands the callee's failure on. Following those marks from a function gives every way it can throw.
//
// Not every such way concerns typed code, and the reader does not assume which: it follows where each value comes
// from (the receiver, a parameter, what a callback returned, a primitive the algorithm made) and asks the declared
// types. A check that a parameter is callable cannot fail when the parameter is declared as a function; a conversion
// to text cannot fail on a parameter declared as a string. What is left to judgement is in three short lists below:
// the operations that run the caller's own code, the checks of the receiver's class, and the sizes no machine holds.

const TYPED_ARRAYS = ['Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array'];
const NATIVE_ERRORS = ['EvalError', 'RangeError', 'ReferenceError', 'SyntaxError', 'TypeError', 'URIError'];

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
 * Operations that give back the value they were given, or one no worse to convert, or fail: what they return is
 * followed as what came in.
 */
const IDENTITY = new Set(['ToObject', 'RequireObjectCoercible', 'ToPrimitive', 'ToPropertyKey', 'ToNumeric']);
/** Operations whose result is a primitive whatever they were given. */
const GIVES_PLAIN = new Set([
  'ToString', 'ToNumber', 'ToNumeric', 'ToIntegerOrInfinity', 'ToLength', 'ToIndex', 'ToInt32', 'ToUint32', 'ToInt16', 'ToUint16', 'ToInt8', 'ToUint8',
  'ToUint8Clamp', 'ToBigInt', 'ToBigInt64', 'ToBigUint64', 'ToBoolean', 'LengthOfArrayLike', 'thisNumberValue', 'thisStringValue', 'thisBooleanValue',
  'thisBigIntValue', 'thisTimeValue', 'min', 'max', 'floor', 'abs', 'IsCallable', 'IsArray', 'SameValue', 'SameValueZero', 'HasProperty',
]);

/** The arguments of a call as written, split at the commas that are not inside another call. */
function split(written) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const character of written) {
    if (character === '(' || character === '«') depth++;
    if (character === ')' || character === '»') depth--;
    if (character === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else current += character;
  }
  if (current.trim() !== '') parts.push(current.trim());
  return parts;
}

/**
 * Where a value written in a step comes from: `this`, `param:<name>` (an argument of the function, untouched),
 * `plain` (a primitive the algorithm made), or `unknown`.
 */
function sourceOf(written, env) {
  const text = written.trim();
  if (/^(?:the )?\*this\* value$/.test(text)) return 'this';
  const name = /^_(\w+)_$/.exec(text);
  if (name !== null) return env.get(name[1]) ?? 'unknown';
  // `*"text"*`, `*undefined*`, `*1*<sub>𝔽</sub>`, `the empty String`, `0`…
  if (/^\*[^*]+\*(?:<sub>[^<]*<\/sub>)?$/.test(text) || /^(?:the empty String|[+-]?\d+|[+-]?∞)$/.test(text)) return 'plain';
  // An element of the rest of the arguments is an argument.
  const element = /^_(\w+)_\[\d+\]$/.exec(text);
  if (element !== null) return env.get(`...${element[1]}`) ?? 'unknown';
  const call = /^[?!]?\s*([A-Za-z]\w*)\((.*)\)$/.exec(text);
  if (call !== null) {
    // What a callback the caller gave returns: its declared return type says what it may be.
    if (call[1] === 'Call') {
      const callback = sourceOf(split(call[2])[0] ?? '', env);
      return callback.startsWith('param:') ? `returns:${callback.slice('param:'.length)}` : 'unknown';
    }
    if (GIVES_PLAIN.has(call[1])) return 'plain';
    if (IDENTITY.has(call[1])) return sourceOf(split(call[2])[0] ?? '', env);
  }
  return 'unknown';
}

/** The names of the parameters in a header: `repeat ( _count_ )`, `StringPad ( _S_: a String, … )`. */
function parameters(header) {
  const from = header.indexOf('(');
  if (from === -1) return [];
  const list = header.slice(from + 1, header.includes('):') ? header.lastIndexOf('):') : header.lastIndexOf(')'));
  return split(list.replaceAll('[', '').replaceAll(']', '')).flatMap((part) => /^(?:\.\.\.)?_(\w+)_/.exec(part)?.[1] ?? []);
}

/**
 * The facts of each clause that has an algorithm: its name, its parameters, the steps that throw (with where the
 * values they test come from), and the operations it calls with `?` (with where their arguments come from).
 */
export function facts(html) {
  return clauses(html)
    // A function has its parameters in its header; an accessor (`get RegExp.prototype.flags`) has none.
    .filter((clause) => clause.algorithms.length > 0 && (clause.header.includes('(') || /^[gs]et /.test(clause.header)))
    .map((clause) => {
      const steps = clause.algorithms.flatMap((alg) => alg.split('\n').map((line) => line.trim()).filter((line) => line !== ''));
      const params = parameters(clause.header);
      const env = new Map(params.map((name) => [name, `param:${name}`]));
      const rest = /\.\.\._(\w+)_/.exec(clause.header)?.[1];
      if (rest !== undefined) env.set(`...${rest}`, `param:${rest}`);
      // The parameters the algorithm tests against `undefined` or `null`: it has an answer for those.
      const tolerates = (value) => params.filter((name) => steps.some((step) => new RegExp(`_${name}_ is (?:not |either |neither )?(?:\\*undefined\\* (?:or|nor) )?\\*${value}\\*`).test(step)));
      const throws = [];
      const calls = new Set();
      const passes = [];
      for (const step of steps) {
        for (const thrown of step.matchAll(/[Tt]hrow an? \*(\w+)\* exception/g)) {
          // The values the step tests before throwing, by where they come from.
          const about = [...new Set([...step.slice(0, thrown.index).matchAll(/_(\w+)_/g)].map((named) => env.get(named[1]) ?? 'unknown'))];
          throws.push({ kind: thrown[1], step: step.replace(/^\d+\.\s*/, ''), about });
        }
        // `? ToObject(*this* value)` fails on a wrong receiver, which types exclude; `? ToObject(_value_)` on an argument.
        for (const call of step.matchAll(/\? ([A-Za-z%][\w.%]*)\(((?:[^()]|\([^()]*\))*)\)/g)) {
          const given = split(call[2]).map((argument) => sourceOf(argument, env));
          calls.add(given[0] === 'this' && split(call[2]).length === 1 ? `${call[1]}:this` : call[1]);
          passes.push({ to: call[1], given });
        }
        for (const call of step.matchAll(/\? _\w+_\.\[\[(\w+)\]\]\(/g)) calls.add(`[[${call[1]}]]`);
        // Each element of the rest of the arguments is an argument too.
        for (const each of step.matchAll(/[Ff]or each (?:element |value )?_(\w+)_ of _(\w+)_/g)) {
          if (rest === each[2]) env.set(each[1], `param:${each[2]}`);
        }
        // What the step names: after it, the name stands for where its value came from. A name given two different
        // origins is no longer known.
        for (const named of step.matchAll(/(?:[Ll]et|[Ss]et) _(\w+)_ (?:be|to) ((?:[^.;()]|\((?:[^()]|\([^()]*\))*\))*)/g)) {
          const origin = sourceOf(named[2], env);
          const before = env.get(named[1]);
          env.set(named[1], before === undefined || before === origin || /^[Ll]et/.test(named[0]) ? origin : before === 'plain' || origin === 'plain' ? (before === 'plain' ? origin : before) : 'unknown');
        }
      }
      return {
        id: clause.id,
        // `_TypedArray_ ( … )` stands for each of the typed arrays: the name without its marks.
        name: (clause.header.includes('(') ? clause.header.slice(0, clause.header.indexOf('(')) : clause.header).trim().replace(/^_(\w+)_$/, '$1'),
        operation: /type="[^"]*abstract operation/.test(clause.attributes) || /type="[^"]*(?:host-defined|implementation-defined)/.test(clause.attributes),
        params,
        ...(rest === undefined ? {} : { rest }),
        tolerates: { undefined: tolerates('undefined'), null: tolerates('null') },
        throws,
        calls: [...calls].toSorted(),
        passes,
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
/** A step that throws because a value is not of the type the declarations require. */
const TYPE_GUARD = [
  /is not an Object/, /is not a (?:String|Number|BigInt|Boolean)\b/, /IsCallable\([^)]*\) is \*false\*/, /IsConstructor\([^)]*\) is \*false\*/,
  /does not have an? \[\[/, /is (?:either )?\*undefined\* or \*null\*/, /NewTarget is (?:not )?\*undefined\*/, /is not callable/,
  /is not a Symbol/, /IsPromise\([^)]*\) is \*false\*/, /_status_ is \*false\*/,
  /\[\[GeneratorBrand\]\] is not/,
  // The last step of a function that returned earlier for every receiver of its class.
  /^Throw a \*TypeError\* exception\.$/,
  // What a constructor other than the library's own would have to give back wrongly.
  /\[\[ContentType\]\] is not/, /\[\[ArrayLength\]\] &lt;/,
  /is not a constructor/, /\bis \*true\*, throw a \*TypeError\*.*IsRegExp|_isRegExp_ is \*true\*/,
];
/**
 * For an accessor only: it is found on the object it is read from, so it never runs on a receiver of another
 * class. Its checks of the receiver cannot fail.
 */
const RECEIVER_GUARD = [/^Otherwise, throw a \*TypeError\*/, /IsSharedArrayBuffer\(_O_\)/];
/** A step that throws on a value that cannot be converted. */
const CONVERSION_GUARD = [/is a Symbol/, /is an? (?:BigInt|Symbol), throw a \*TypeError\*/];
/**
 * A step that throws on a buffer that was detached: handed to another thread, or transferred. Kept apart: a project
 * may say that it never detaches one.
 */
const DETACHED = [/IsDetachedBuffer/];
/** A step that throws past a size no machine holds. */
const SIZE_LIMIT = [/2<sup>53<\/sup>/, /2\*\*53/, /2<sup>32<\/sup>/];

/** What each conversion refuses, by kind of value: the rest it converts. */
export const REFUSES = {
  ToObject: ['undefined', 'null'],
  RequireObjectCoercible: ['undefined', 'null'],
  ToPropertyKey: ['object'],
  ToPrimitive: ['object'],
  OrdinaryToPrimitive: ['object'],
  ToString: ['symbol', 'object'],
  ToNumeric: ['symbol', 'object'],
  ...Object.fromEntries(
    ['ToNumber', 'ToIntegerOrInfinity', 'ToLength', 'ToInt32', 'ToUint32', 'ToInt16', 'ToUint16', 'ToInt8', 'ToUint8', 'ToUint8Clamp'].map((name) => [name, ['symbol', 'bigint', 'object']]),
  ),
  ...Object.fromEntries(['ToBigInt', 'ToBigInt64', 'ToBigUint64'].map((name) => [name, ['undefined', 'null', 'string', 'number', 'symbol', 'object']])),
  // A descriptor that names both a value and a getter is refused, whatever its type says.
  ToPropertyDescriptor: ['undefined', 'null', 'string', 'number', 'bigint', 'boolean', 'symbol', 'object', 'shaped'],
  CreateListFromArrayLike: ['undefined', 'null', 'string', 'number', 'bigint', 'boolean', 'symbol'],
};

/** A check of a parameter that the declared type of the parameter may make impossible to fail: what it accepts. */
const PARAMETER_GUARD = [
  { pattern: /IsCallable\(_(\w+)_\) is \*false\*/, accepts: ['function'] },
  { pattern: /_(\w+)_ is not an Object/, accepts: ['object', 'shaped', 'function', 'array'] },
];

/**
 * How a clause can throw, in terms of its own parameters: `real` reasons, whether a detached buffer is one, the
 * conversions it applies (`{ op, on }`, where `on` is `param:<name>` or `unknown`) and the checks of a parameter
 * that hold when the parameter has the declared kind (`{ on, accepts, reason }`).
 */
export function analyse(all) {
  const byName = new Map(all.map((clause) => [clause.name, clause]));
  const known = new Map();
  const empty = { real: [], detached: false, conversions: [], guards: [] };
  const visit = (clause, path) => {
    if (known.has(clause.name)) return known.get(clause.name);
    if (path.includes(clause.name)) return empty;
    const real = [];
    const conversions = [];
    const guards = [];
    let detached = false;
    const accessor = /^[gs]et /.test(clause.name);
    for (const thrown of clause.throws) {
      if (accessor && RECEIVER_GUARD.some((pattern) => pattern.test(thrown.step))) continue;
      const reason = `${thrown.kind}: ${thrown.step.replace(/<[^>]+>/g, '').slice(0, 110)}`;
      // A check of a parameter: whether it can fail is asked of the parameter's declared type.
      const checked = PARAMETER_GUARD.flatMap((guard) => {
        const name = guard.pattern.exec(thrown.step)?.[1];
        if (name === undefined || !clause.params.includes(name) || !thrown.about.includes(`param:${name}`)) return [];
        const also = ['undefined', 'null'].filter((value) => thrown.step.includes(`*${value}*`) || clause.tolerates[value].includes(name));
        return [{ on: `param:${name}`, accepts: [...guard.accepts, ...also], reason }];
      });
      if (checked.length > 0) guards.push(...checked);
      else if (TYPE_GUARD.some((pattern) => pattern.test(thrown.step)) || SIZE_LIMIT.some((pattern) => pattern.test(thrown.step))) continue;
      else if (DETACHED.some((pattern) => pattern.test(thrown.step))) detached = true;
      else if (CONVERSION_GUARD.some((pattern) => pattern.test(thrown.step))) conversions.push({ op: 'ToString', on: 'unknown' });
      else real.push(reason);
    }
    for (const pass of clause.passes) {
      const called = pass.to;
      const first = pass.given[0];
      if (REFUSES[called] !== undefined) {
        // The receiver is an instance of the class the method was found on: it converts as that class does.
        if (first !== 'this' && first !== 'plain') conversions.push({ op: called, on: first ?? 'unknown' });
        continue;
      }
      if (UNREACHABLE.has(called)) continue;
      const callee = byName.get(called);
      // An operation this reader does not know may throw: nothing says otherwise.
      if (callee === undefined) {
        real.push(`? ${called}`);
        continue;
      }
      const inner = visit(callee, [...path, clause.name]);
      detached ||= inner.detached;
      // What the operation says of its parameters is said here of what it was given.
      const given = (on) => {
        const returned = on.startsWith('returns:');
        if (!returned && !on.startsWith('param:')) return on;
        const index = callee.params.indexOf(on.slice(on.indexOf(':') + 1));
        const origin = index === -1 ? 'unknown' : (pass.given[index] ?? 'unknown');
        if (!returned) return origin;
        return origin.startsWith('param:') ? `returns:${origin.slice('param:'.length)}` : 'unknown';
      };
      for (const conversion of inner.conversions) {
        const on = given(conversion.on);
        if (on !== 'this' && on !== 'plain') conversions.push({ op: conversion.op, on });
      }
      for (const guard of inner.guards) {
        const on = given(guard.on);
        // Off a parameter of the function, the check is one of the operation's own: as before, it holds.
        if (on.startsWith('param:')) guards.push({ ...guard, on });
      }
      for (const reason of inner.real) {
        // The operation an accessor hands its receiver to checks it in its place.
        if (accessor && RECEIVER_GUARD.some((pattern) => pattern.test(reason.replace(/^(?:via \w+: )?\w+: /, '')))) continue;
        real.push(reason.startsWith('via ') ? reason : `via ${called}: ${reason}`);
      }
    }
    const unique = (list) => [...new Map(list.map((item) => [JSON.stringify(item), item])).values()];
    const result = { real: [...new Set(real)].slice(0, 4), detached, conversions: unique(conversions), guards: unique(guards) };
    known.set(clause.name, result);
    return result;
  };
  return new Map(all.filter((clause) => !clause.operation).map((clause) => [clause.name, { id: clause.id, params: clause.params, rest: clause.rest, ...visit(clause, []) }]));
}

const EVERY_KIND = ['string', 'number', 'bigint', 'boolean', 'undefined', 'null', 'symbol', 'object', 'shaped', 'function'];
const PLAIN_KINDS = ['string', 'number', 'bigint', 'boolean', 'undefined', 'null'];

/** The kinds of value a declared type admits, from its description (see `library.mjs`). */
export function kindsOf(type) {
  switch (type.k) {
    case 'any':
      return EVERY_KIND;
    case 'string':
    case 'number':
    case 'bigint':
    case 'boolean':
    case 'symbol':
    case 'undefined':
    case 'null':
      return [type.k];
    case 'literal':
      return [typeof type.v];
    case 'union':
      return [...new Set(type.of.flatMap(kindsOf))];
    case 'function':
      return ['function'];
    case 'array':
      // An array of plain values converts as they do.
      return kindsOf(type.of).every((kind) => PLAIN_KINDS.includes(kind)) ? ['array'] : ['object'];
    case 'objectLike':
      return ['object'];
    default:
      // A type with a shape (a class of the library, an object with named properties): the generator makes values
      // of it, so the runs try what it admits, as they do for a primitive.
      return ['shaped'];
  }
}

/**
 * What the specification says of a function as the compiler declares it: `{ id, real, detached, converts }`.
 * `converts` is whether a conversion may meet a value it refuses, given the declared types of the parameters:
 * `no`, `primitive` (a kind the runs always try: a number where a bigint is wanted) or `object` (a value only some
 * objects are: one without a prototype, a symbol), which runs may miss.
 */
export function resolve(summary, declared) {
  // The kinds the declarations admit for the parameter the specification calls `name`.
  const admitted = (on) => {
    const returned = on.startsWith('returns:');
    const name = on.slice(on.indexOf(':') + 1);
    const index = summary.params.indexOf(name);
    const kinds = new Set();
    for (const signature of declared.signatures) {
      const last = signature.params.at(-1);
      // The rest of the arguments, in the specification, is every argument from there on.
      const parameters = summary.rest === name ? signature.params.slice(index) : [signature.params[index] ?? (last?.rest ? last : undefined)];
      for (const parameter of parameters) {
        // Not declared: nobody can pass it, and the function sees `undefined`.
        if (parameter === undefined) kinds.add('undefined');
        else if (returned) {
          // What the callback returns, by its declared type; a parameter that is not declared as a function says nothing.
          const callbacks = (parameter.type.k === 'union' ? parameter.type.of : [parameter.type]).filter((member) => member.k === 'function');
          for (const kind of callbacks.length === 0 ? EVERY_KIND : callbacks.flatMap((callback) => kindsOf(callback.returns))) kinds.add(kind);
        } else {
          for (const kind of kindsOf(parameter.type)) kinds.add(kind);
          if (parameter.optional) kinds.add('undefined');
        }
      }
    }
    return [...kinds];
  };
  const real = [...summary.real];
  for (const guard of summary.guards) {
    const outside = admitted(guard.on).filter((kind) => !guard.accepts.includes(kind));
    if (outside.length > 0) real.push(`${guard.reason} (the declared type admits ${outside.join(', ')})`);
  }
  let converts = 'no';
  for (const conversion of summary.conversions) {
    const refused = conversion.on === 'unknown' ? REFUSES[conversion.op] : admitted(conversion.on).filter((kind) => REFUSES[conversion.op].includes(kind));
    if (refused.some((kind) => kind === 'object' || kind === 'symbol')) converts = 'object';
    else if (refused.length > 0 && converts === 'no') converts = 'primitive';
  }
  return { id: summary.id, real: real.slice(0, 4), detached: summary.detached, converts };
}

/** The names the compiler's declarations give to a function of the specification. */
export function declaredNames(specName) {
  // Functions the specification defines by pointing at another one.
  const same = { parseFloat: ['NumberConstructor.parseFloat'], parseInt: ['NumberConstructor.parseInt'], 'Set.prototype.values': ['Set.keys', 'ReadonlySet.keys'] };
  // One clause for the eleven typed arrays, and one for the six errors of the language.
  if (specName.includes('%TypedArray%.')) return TYPED_ARRAYS.flatMap((name) => namesOf(specName.replace('%TypedArray%', name)));
  if (specName === 'TypedArray') return TYPED_ARRAYS.flatMap(namesOf);
  if (specName === 'NativeError') return NATIVE_ERRORS.flatMap(namesOf);
  return [...namesOf(specName), ...(same[specName] ?? [])];
}

function namesOf(specName) {
  const constructors = [
    'String', 'Number', 'Boolean', 'BigInt', 'Symbol', 'Array', 'Object', 'Date', 'RegExp', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Error', 'Function',
    'ArrayBuffer', 'SharedArrayBuffer', 'DataView', 'WeakRef', 'FinalizationRegistry', 'AggregateError', 'Proxy', ...TYPED_ARRAYS, ...NATIVE_ERRORS,
  ];
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

/**
 * The accessors that can throw when read: `{ 'DataView.byteLength': 'TypeError: If IsDetachedBuffer(…) …' }`, by the
 * class and the name of the property.
 */
export function throwingGetters(verdicts) {
  const found = {};
  for (const [name, verdict] of verdicts) {
    const getter = /^get (\w+)\.prototype\.(\w+)$/.exec(name);
    if (getter === null) continue;
    if (verdict.real.length > 0) found[`${getter[1]}.${getter[2]}`] = { why: verdict.real[0], spec: verdict.id };
    else if (verdict.detached) found[`${getter[1]}.${getter[2]}`] = { why: 'TypeError: detached', spec: verdict.id, detached: true };
  }
  return found;
}
