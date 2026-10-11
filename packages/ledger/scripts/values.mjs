// Generates values that fit a described type, from a seeded sequence so that a run can be repeated.
// `plain` decides what stands for a type that says nothing (any, unknown, a type parameter): printable primitives
// only, or anything a JavaScript value can be: symbols, objects without a prototype, cycles.

/** A small seeded generator (mulberry32): the same seed gives the same values. */
export function sequence(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, pick: (list) => list[Math.floor(next() * list.length)], chance: (p) => next() < p };
}

const NUMBERS = [0, 1, -1, 2, 3, 7, 10, 16, 36, 37, 100, 101, 0.5, -0.5, 1e21, 2 ** 31, 2 ** 32, 2 ** 53, -(2 ** 31), NaN, Infinity, -Infinity, -0];
const STRINGS = ['', 'a', 'abc', ' a,b ', 'A-b_c', '42', '-1.5', '1e3', '0x1f', 'true', '%', '%E0%A4%A', 'a%20b', '(', '[a-', '\\', '{', '{"a":1}', 'NFC', 'en-US', 'xx-invalid-locale', '2026-10-11T00:00:00Z', 'not a date', '\ud800', 'é', '😀', 'g', 'gi', 'gg', 'utf8'];
const BIGINTS = [0n, 1n, -1n, 2n ** 64n];
const PATTERNS = () => [/a/, /a/g, /^a+$/i, /(b)(c)?/g, /\s+/y];

/** A value that is not plain: what breaks a function that converts what it is given. */
function odd(random) {
  const cyclic = { name: 'cyclic' };
  cyclic.self = cyclic;
  return random.pick([
    () => Symbol('s'),
    () => Object.create(null),
    () => cyclic,
    () => ({ toString: () => ({}), valueOf: () => ({}) }),
    () => 10n,
    () => () => 1,
    () => new Date(NaN),
    () => new Map([[1, 2]]),
    () => ({ a: 1, b: [1, 2] }),
    () => [Symbol('in an array')],
    () => null,
    () => undefined,
  ])();
}

const plainValue = (random) => random.pick([() => random.pick(STRINGS), () => random.pick(NUMBERS), () => random.chance(0.5), () => undefined, () => null])();

export function generate(type, random, plain, depth = 0) {
  switch (type.k) {
    case 'any':
      return plain || random.chance(0.5) ? plainValue(random) : odd(random);
    case 'objectLike':
      return plain || random.chance(0.5) ? random.pick([() => ({}), () => ({ a: 1 }), () => [1, 2], () => new Map()])() : random.pick([() => Object.create(null), () => Object.freeze({ frozen: true }), () => () => 1])();
    case 'literal':
      return type.v;
    case 'string':
      return random.pick(STRINGS);
    case 'number':
      return random.pick(NUMBERS);
    case 'boolean':
      return random.chance(0.5);
    case 'bigint':
      return random.pick(BIGINTS);
    case 'symbol':
      return random.pick([Symbol('s'), Symbol.iterator, Symbol.for('registered')]);
    case 'undefined':
      return undefined;
    case 'null':
      return null;
    case 'union':
      return generate(random.pick(type.of), random, plain, depth + 1);
    case 'tuple':
      return type.of.map((item) => generate(item, random, plain, depth + 1));
    case 'array': {
      const length = depth > 2 ? 0 : random.pick([0, 0, 1, 2, 3, 5]);
      return Array.from({ length }, () => generate(type.of, random, plain, depth + 1));
    }
    case 'function': {
      const returned = Array.from({ length: 4 }, () => generate(type.returns, random, plain, depth + 1));
      let calls = 0;
      // A callback of conforming code does not throw: this one only hands back generated values.
      return () => returned[calls++ % returned.length];
    }
    case 'object': {
      const made = {};
      for (const [name, property] of Object.entries(type.props)) {
        if (property.optional && random.chance(0.5)) continue;
        made[name] = generate(property.type, random, plain, depth + 1);
      }
      return made;
    }
    case 'library':
      return instance(type, random, plain, depth);
    default:
      return undefined;
  }
}

/** A value of a type the library declares, by its name. Undefined when this generator does not know how to make one. */
export function instance(type, random, plain, depth = 0) {
  const item = () => generate(type.of ?? { k: 'any' }, random, plain, depth + 1);
  const other = () => generate(type.and ?? { k: 'any' }, random, plain, depth + 1);
  const few = (make) => Array.from({ length: random.pick([0, 1, 2, 4]) }, make);
  if (/^(?:Big)?(?:Ui|I)nt\d+(?:Clamped)?Array$|^Float\d+Array$/.test(type.name)) {
    const size = random.pick([0, 1, 2, 8]);
    const big = type.name.startsWith('Big');
    // Sometimes over memory two threads share: what `Atomics` is for.
    const made = new globalThis[type.name](random.chance(0.3) ? new SharedArrayBuffer(size * globalThis[type.name].BYTES_PER_ELEMENT) : size);
    for (let index = 0; index < size; index++) made[index] = big ? random.pick(BIGINTS.filter((value) => value < 2n ** 62n && value > -(2n ** 62n))) : random.pick([0, 1, 2, 3, 127, 255]);
    return made;
  }
  switch (type.name) {
    case 'String':
      return random.pick(STRINGS);
    case 'Number':
      return random.pick(NUMBERS);
    case 'Boolean':
      return random.chance(0.5);
    case 'BigInt':
      return random.pick(BIGINTS);
    case 'Symbol':
      return Symbol('s');
    case 'Array':
    case 'ReadonlyArray':
    case 'ArrayLike':
    case 'ConcatArray':
    case 'Iterable':
    case 'IterableIterator':
      return few(item);
    case 'Object':
      return random.pick([() => ({}), () => ({ a: 1 }), () => [1, 2], () => Object.freeze({ frozen: true })])();
    case 'Date':
      return new Date(random.pick([0, 1e12, -1e12, NaN, 8.64e15, 8.64e15 + 1]));
    case 'RegExp':
      return random.pick(PATTERNS());
    case 'Map':
    case 'ReadonlyMap':
      return new Map(few(() => [item(), other()]));
    case 'Set':
    case 'ReadonlySet':
      return new Set(few(item));
    case 'ArrayBuffer':
    case 'ArrayBufferLike':
      return new ArrayBuffer(random.pick([0, 8, 16, 24]));
    case 'SharedArrayBuffer':
      return new SharedArrayBuffer(random.pick([0, 8, 16, 24]));
    case 'DataView':
      return new DataView(new ArrayBuffer(random.pick([0, 8, 16])));
    case 'ArrayBufferView':
      return new Uint8Array(random.pick([0, 2, 8]));
    case 'Generator':
    case 'Iterator':
      return (function* generated() {
        yield 1;
        yield 2;
        return 3;
      })();
    case 'AsyncGenerator':
    case 'AsyncIterator':
      return (async function* generated() {
        yield 1;
        return 2;
      })();
    case 'WeakRef':
      return new WeakRef({});
    case 'FinalizationRegistry':
      return new FinalizationRegistry(() => undefined);
    case 'WeakMap':
      return new WeakMap();
    case 'WeakSet':
      return new WeakSet();
    case 'Promise':
    case 'PromiseLike':
      return Promise.resolve(item());
    case 'Error':
      return new Error('generated');
    case 'Function':
    case 'CallableFunction':
      return function generated() {
        return 1;
      };
    case 'NewableFunction':
      return class Generated {};
    case 'PropertyDescriptor':
      return random.pick([() => ({ value: 1, writable: true, configurable: true }), () => ({ get: () => 1 }), () => ({ value: 1, get: () => 1 })])();
    case 'PropertyDescriptorMap':
      return { a: { value: 1 } };
    case 'TemplateStringsArray':
      return Object.assign(['a', 'b'], { raw: ['a', 'b'] });
    default:
      return undefined;
  }
}

/** A value as short text, for an example in the ledger. */
export function show(value) {
  if (typeof value === 'string') return JSON.stringify(value.length > 24 ? `${value.slice(0, 24)}…` : value);
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'symbol') return 'Symbol()';
  if (typeof value === 'function') return 'function';
  if (value === null || typeof value !== 'object') return String(value);
  if (Array.isArray(value)) return `[${value.slice(0, 3).map(show).join(', ')}${value.length > 3 ? ', …' : ''}]`;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? 'new Date(NaN)' : 'new Date(…)';
  if (value instanceof RegExp) return String(value);
  return Object.getPrototypeOf(value) === null ? 'Object.create(null)' : `${value.constructor?.name ?? 'object'} {…}`;
}
