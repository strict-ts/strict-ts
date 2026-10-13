import type { Rule } from '../rule.js';
import type { Node } from '../syntax.js';
import { isViewOf, MAKERS, mayBeWritten } from './mutable.js';


/**
 * `mut(…)` says of something that it may be changed, and the compiler believes it. So it is given only what was
 * just made, which nobody else holds; or a part of a thing of the platform that may itself be changed.
 */
export const mutFresh: Rule = {
  name: 'mut-fresh',
  guarantee: 'mutability',
  description:
    '`mut(…)` is given something just made: an object, an array or a function written in place, what `new` makes, what a function of the platform known to make something new gives back (`slice`, `map`, `structuredClone`, `createElement`). Or a part of a thing of the platform that may be changed: of the page (`document.body`), or of something typed `Mut<…>` (`canvas.getContext(…)`), under a name of its own if it has one (the variable of a loop over `page.querySelectorAll(…)`). Not a name, a parameter, a field, nor what a function of the project gave back: those say `Mut<…>` themselves or are read.',
  scope: 'safe',
  visit(node, { typeOf, calleeOf, report }) {
    if (node.kind !== 'call' || node.callee.kind !== 'identifier' || node.callee.text !== 'mut' || !typeOf(node).isMut) return;
    const [given] = node.arguments;
    if (given === undefined) return;
    /** A name of the platform itself: `document`, `window`, `Object`. */
    const isGlobal = (named: Node): boolean => named.kind === 'identifier' && (named.declaredOutside || named.text === 'globalThis');
    const fresh = (value: Node, depth = 0): boolean => {
      if (depth > 6) return false;
      // A view over bytes that exist is theirs: it is marked when they are.
      if (isViewOf(value, typeOf)) return value.kind === 'new' && value.arguments[0] !== undefined && mayBeWritten(value.arguments[0], typeOf);
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
      // What the platform holds for everyone: `document`, `globalThis`.
      if (isGlobal(value)) return true;
      // A name for a part of a thing of the platform that may be changed: the variable of a loop over
      // `page.querySelectorAll(…)`, a constant made of `element.firstChild`. Every place it comes from is one.
      if (value.kind === 'identifier' && value.parameter === 'none' && value.aliasOf.length > 0) {
        return value.aliasOf.every((alias) => alias.as !== 'result' && (typeOf(alias.place).isMut || isGlobal(alias.place) || fresh(alias.place, depth + 1)) && !typeOf(alias.place).isArray);
      }
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
