import type { Rule } from '../rule.js';
import type { Node } from '../syntax.js';
import { mut } from '../mut.js';

/**
 * The functions of the platform that make something new: a new list or map of the same things, a copy, a thing of
 * the page that did not exist. The mark of `Mut<…>` is one level, so a new container is safe to mark whatever it
 * holds: what it holds says `Mut<…>` for itself, or is read.
 */
const MAKERS = new Set([
  'slice', 'map', 'filter', 'concat', 'flat', 'flatMap', 'toSorted', 'toReversed', 'toSpliced', 'with', 'from', 'of', 'fromEntries', 'entries', 'keys', 'values', 'groupBy',
  'structuredClone', 'parse', 'split', 'match', 'matchAll', 'subarray',
  'createElement', 'createElementNS', 'createTextNode', 'createDocumentFragment', 'cloneNode', 'getImageData', 'createImageData', 'getBoundingClientRect',
  'createRadialGradient', 'createLinearGradient', 'createPattern',
]);

/**
 * `mut(…)` says of something that it may be changed, and the compiler believes it. So it is given only what was
 * just made, which nobody else holds; or a part of a thing of the platform that may itself be changed.
 */
export const mutFresh: Rule = {
  name: 'mut-fresh',
  guarantee: 'mutability',
  description:
    '`mut(…)` is given something just made: an object, an array or a function written in place, what `new` makes, what a function of the platform known to make something new gives back (`slice`, `map`, `structuredClone`, `createElement`). Or a part of a thing of the platform that may be changed: of the page (`document.body`), or of something typed `Mut<…>` (`canvas.getContext(…)`). Not a name, a parameter, a field, nor what a function of the project gave back: those say `Mut<…>` themselves or are read.',
  scope: 'safe',
  visit(node, { typeOf, calleeOf, report }) {
    if (node.kind !== 'call' || node.callee.kind !== 'identifier' || node.callee.text !== 'mut' || !typeOf(node).isMut) return;
    const [given] = node.arguments;
    if (given === undefined) return;
    /** A name of the platform itself: `document`, `window`, `Object`. */
    const isGlobal = (named: Node): boolean => named.kind === 'identifier' && named.declaredOutside;
    const fresh = (value: Node, depth = 0): boolean => {
      if (depth > 6) return false;
      if (value.kind === 'literal' || value.kind === 'new' || value.kind === 'function') return true;
      // Already something to change: saying it again changes nothing.
      if (typeOf(value).isMut) return true;
      if (value.kind === 'conditional') return fresh(value.whenTrue, depth + 1) && fresh(value.whenFalse, depth + 1);
      if (value.kind === 'binary' && ['??', '||', '&&'].includes(value.operator)) return fresh(value.left, depth + 1) && fresh(value.right, depth + 1);
      if (value.kind === 'call') {
        const callee = value.callee;
        // `value ?? panic(…)`: a call that gives nothing back gives nothing to mark.
        if (typeOf(value).kinds.every((kind) => kind === 'never')) return true;
        if (calleeOf(value)?.origin.kind === 'project') return false;
        const name = callee.kind === 'property-access' ? callee.name : callee.kind === 'identifier' ? callee.text : '';
        if (MAKERS.has(name)) return true;
        // A part of a thing of the platform: of the page, or of something that may itself be changed.
        return callee.kind === 'property-access' && callee.ofPlatform && (isGlobal(callee.object) || typeOf(callee.object).isMut);
      }
      if (value.kind === 'property-access' && value.ofPlatform) return isGlobal(value.object) || typeOf(value.object).isMut || fresh(value.object, depth + 1);
      // Parentheses, `await`, `!`, `satisfies`: the one thing written inside.
      const [inner] = value.children;
      return ['sequence', 'await', 'other', 'as'].includes(value.kind) && inner !== undefined && fresh(inner, depth + 1);
    };
    if (fresh(given)) return;
    report(
      given,
      '`mut(…)` is given something that was not made here: whoever else holds it was told it cannot change.',
      'Give it what is made in place (`mut({ … })`, `mut(new Map())`, `mut([...list])`); what comes from elsewhere is typed `Mut<…>` where it comes from, or is read.',
    );
  },
};
