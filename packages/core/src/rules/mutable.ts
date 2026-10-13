// What the rules of mutability share: whether something may be written through, and what makes something new.
import type { Type } from '../provider.js';
import type { Node } from '../syntax.js';

/**
 * The functions of the platform that make something new: a new list or map of the same things, a copy, a thing of
 * the page that did not exist. The mark of `Mut<…>` is one level, so a new container is safe to mark whatever it
 * holds: what it holds says `Mut<…>` for itself, or is read.
 */
export const MAKERS = new Set([
  'slice', 'map', 'filter', 'concat', 'flat', 'flatMap', 'toSorted', 'toReversed', 'toSpliced', 'with', 'from', 'of', 'fromEntries', 'entries', 'keys', 'values', 'groupBy',
  'structuredClone', 'parse', 'split', 'match', 'matchAll', 'subarray',
  'createElement', 'createElementNS', 'createTextNode', 'createDocumentFragment', 'cloneNode', 'getImageData', 'createImageData', 'getBoundingClientRect',
  'createRadialGradient', 'createLinearGradient', 'createPattern',
]);

/** The constructors that make a view over bytes they are given. */
const VIEWS = /^(?:(?:Int|Uint|Float|BigInt|BigUint)\d+(?:Clamped)?Array|DataView)$/;
/** `new Uint8Array(buffer)`, `new DataView(buffer)`: made over bytes that exist, which it shares. */
export const isViewOf = (made: Node, typeOf: (node: Node) => Type): boolean => {
  if (made.kind !== 'new' || made.callee.kind !== 'identifier' || !VIEWS.test(made.callee.text)) return false;
  const [first] = made.arguments;
  return first !== undefined && /ArrayBuffer/.test(typeOf(first).text);
};

/**
 * Whether an object may be written through. Its type says `Mut<…>`, and so does each thing it is a part of, back to
 * a name: `cart.items` is a list to change when `items` says so and `cart` does. The compiler gives the mark to a
 * field whoever holds the object; a read-only holder does not hand out what it holds to be changed.
 */
export const mayBeWritten = (object: Node, typeOf: (node: Node) => Type, depth = 0): boolean => {
  if (depth > 10) return false;
  // The object being made: nobody else holds it yet.
  if (object.kind === 'this') return object.receiver === 'mutable' || typeOf(object).isMut;
  // What the platform itself holds for everyone (`document`, `process`, `localStorage`): nobody gave it.
  if (object.kind === 'identifier' && (object.declaredOutside || object.text === 'globalThis')) return true;
  // A typed array or a `DataView` made over bytes it is given is a view of them, not a copy: it may be written
  // when they may.
  if (object.kind === 'new' && isViewOf(object, typeOf)) return object.arguments[0] !== undefined && mayBeWritten(object.arguments[0], typeOf, depth + 1);
  // Written in place: it has no name yet.
  if (object.kind === 'literal' || object.kind === 'new') return true;
  if (object.kind === 'property-access' || object.kind === 'element-access') {
    // `element.style.color`: the types of the platform cannot say `Mut<…>` inside, and its parts go with it.
    if (object.kind === 'property-access' && object.ofPlatform) return mayBeWritten(object.object, typeOf, depth + 1);
    return typeOf(object).isMut && mayBeWritten(object.object, typeOf, depth + 1);
  }
  if (object.kind === 'call') {
    const callee = object.callee;
    const made = callee.kind === 'property-access' ? callee.name : callee.kind === 'identifier' ? callee.text : '';
    const ofProject = typeOf(callee).isImplemented || typeOf(callee).isWrittenInProject;
    // Just made by a function of the platform that makes something new: `list.slice().reverse()`.
    if (!ofProject && MAKERS.has(made)) return true;
    if (!typeOf(object).isMut) return false;
    // What a function of the project gives back says `Mut<…>` in its return type; `mut(…)` is asked by its own rule.
    if (ofProject || made === 'mut') return true;
    // What a method of the platform hands out of its object (`list.find(…)`, `map.get(…)`) is a part of that object.
    return callee.kind === 'property-access' && mayBeWritten(callee.object, typeOf, depth + 1);
  }
  if (object.kind === 'identifier') {
    if (!typeOf(object).isMut) return false;
    // A parameter of a function given to `forEach` or `map` is one of the things those go through.
    return object.fedFrom.every((from) => mayBeWritten(from, typeOf, depth + 1));
  }
  // Parentheses, `!`, `satisfies`, `await`: the one thing written inside. A choice: each of the two.
  if (object.kind === 'conditional') return mayBeWritten(object.whenTrue, typeOf, depth + 1) && mayBeWritten(object.whenFalse, typeOf, depth + 1);
  if (object.kind === 'binary' && ['??', '||', '&&'].includes(object.operator)) return mayBeWritten(object.left, typeOf, depth + 1) && mayBeWritten(object.right, typeOf, depth + 1);
  const [seen] = object.children;
  return ['sequence', 'other', 'as', 'await'].includes(object.kind) && seen !== undefined && mayBeWritten(seen, typeOf, depth + 1);
};

