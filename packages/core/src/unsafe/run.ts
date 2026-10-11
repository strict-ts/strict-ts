// Runs a function of the language as checked code would call it, to see whether it throws on arguments that are
// written in the call. The one place where core runs anything; it reaches functions by their names, which nothing
// types, and whatever they throw leaves here as a value.

/** What crosses this boundary: a value, or why there is none. */
export type Outcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

const said = (cause: unknown): string => (cause instanceof Error ? cause.message : 'threw');

export function wholeNumber(text: string): Outcome<bigint> {
  try {
    return { ok: true, value: BigInt(text) };
  } catch (cause) {
    return { ok: false, error: said(cause) };
  }
}

export function pattern(source: string, flags: string): Outcome<RegExp> {
  try {
    return { ok: true, value: new RegExp(source, flags) };
  } catch (cause) {
    return { ok: false, error: said(cause) };
  }
}

/** The classes whose functions are run: those of values that hold nothing but themselves. */
const CLASSES = ['String', 'Number', 'BigInt', 'Boolean', 'Date', 'RegExp'];
const NAMESPACES = ['JSON', 'Math'];
const INTERNATIONAL = ['DateTimeFormat', 'NumberFormat', 'Collator', 'PluralRules', 'ListFormat', 'RelativeTimeFormat', 'Segmenter', 'Locale'];
const FUNCTIONS = ['encodeURI', 'encodeURIComponent', 'decodeURI', 'decodeURIComponent', 'parseInt', 'parseFloat', 'isNaN', 'isFinite'];

/**
 * Receivers of each class, among them the ones functions are known to throw on: not a number, a date that is not
 * one, an empty text, a text that ends in half a character.
 */
const receiversOf = (owner: string): readonly unknown[] => {
  switch (owner) {
    case 'String':
      return ['', 'a', 'abc', ' a,b ', '42', '-1.5', '%', '(', '[a-', '\\', '{"a":1}', '\ud800', 'é', '😀', 'x'.repeat(300)];
    case 'Number':
      return [0, -0, 1, -1, 0.5, 1.005, 37, 1e21, 1e-7, 2 ** 31, 2 ** 53, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
    case 'BigInt':
      return [0n, 1n, -1n, 2n ** 64n, -(2n ** 64n)];
    case 'Boolean':
      return [true, false];
    case 'Date':
      return [new Date(0), new Date(1e12), new Date(-1e12), new Date(8.64e15), new Date(Number.NaN)];
    case 'RegExp':
      return [/a/, /a/g, /^a+$/i, /(b)(c)?/gu, /\s+/y];
    default:
      return [];
  }
};

type Call = (receiver: unknown, given: readonly unknown[]) => Outcome<unknown>;

/** Calls a function found by name: what it throws is the answer this file is asked for. */
const invoke = (found: Function, receiver: unknown, given: readonly unknown[]): Outcome<unknown> => {
  try {
    return { ok: true, value: Reflect.apply(found, receiver, given) };
  } catch (cause) {
    return { ok: false, error: said(cause) };
  }
};
const construct = (found: Function, given: readonly unknown[]): Outcome<unknown> => {
  try {
    return { ok: true, value: Reflect.construct(found, given) };
  } catch (cause) {
    return { ok: false, error: said(cause) };
  }
};

/** What a declared name is at run time: how to call it, and on what. Nothing for what this file does not run. */
function locate(name: string): { readonly receivers: readonly unknown[] | undefined; readonly call: Call } | undefined {
  const dot = name.indexOf('.');
  const owner = dot === -1 ? '' : name.slice(0, dot);
  const member = dot === -1 ? name : name.slice(dot + 1);
  // SAFETY: a global is read by its name and tested before it is used: only a function is ever called.
  const global = (key: string): unknown => Reflect.get(globalThis, key) ?? Reflect.get(Intl, key);
  // SAFETY: the same, for a member of an object that was itself found by name, or of a receiver.
  const memberOf = (holder: unknown, key: string): unknown => (holder === undefined || holder === null ? undefined : Reflect.get(Object(holder), key));
  if (owner === '') {
    const found = FUNCTIONS.includes(member) || CLASSES.includes(member) ? global(member) : undefined;
    return typeof found === 'function' ? { receivers: undefined, call: (_receiver, given) => invoke(found, undefined, given) } : undefined;
  }
  const built = owner.endsWith('Constructor') ? owner.slice(0, -'Constructor'.length) : owner;
  const known = CLASSES.includes(built) || INTERNATIONAL.includes(built);
  if (member === 'new' || (member === '' && owner.endsWith('Constructor'))) {
    const found = known ? global(built) : undefined;
    if (typeof found !== 'function') return undefined;
    return { receivers: undefined, call: (_receiver, given) => (member === 'new' ? construct(found, given) : invoke(found, undefined, given)) };
  }
  if (owner.endsWith('Constructor') || NAMESPACES.includes(owner)) {
    const holder = owner.endsWith('Constructor') ? (known ? global(built) : undefined) : global(owner);
    const found = memberOf(holder, member);
    return typeof found === 'function' ? { receivers: undefined, call: (_receiver, given) => invoke(found, holder, given) } : undefined;
  }
  if (!CLASSES.includes(owner)) return undefined;
  return {
    receivers: receiversOf(owner),
    call: (receiver, given) => {
      // Looked up on the receiver, as a call in the checked code would.
      const method = memberOf(receiver, member);
      return typeof method === 'function' ? invoke(method, receiver, given) : { ok: false, error: 'no such method' };
    },
  };
}

/**
 * Calls the function `name` with each of the given lists of arguments, on each receiver of its class when it has
 * one that is not written in the call (`written`). `quiet` when no call threw; `hasReceiver` says whether that was
 * shown on a list of receivers and not on the call itself. An error when the function is not one this file runs.
 */
export function runs(
  name: string,
  given: readonly (readonly unknown[])[],
  written?: readonly unknown[],
): Outcome<{ readonly quiet: boolean; readonly hasReceiver: boolean }> {
  const located = locate(name);
  if (located === undefined) return { ok: false, error: 'not a function that is run' };
  // A receiver written in the call (`"x".repeat(3)`) is the receiver: the list of them is not needed.
  const target = located.receivers !== undefined && written !== undefined ? { receivers: written, call: located.call, exact: true } : { ...located, exact: located.receivers === undefined };
  for (const list of given) {
    for (const receiver of target.receivers ?? [undefined]) {
      const result = target.call(receiver, list);
      if (!result.ok) return { ok: true, value: { quiet: false, hasReceiver: !target.exact } };
      // What a promise does, it does later: nothing is known of it here.
      if (result.value instanceof Promise) return { ok: false, error: 'returns a promise' };
    }
  }
  return { ok: true, value: { quiet: true, hasReceiver: !target.exact } };
}
