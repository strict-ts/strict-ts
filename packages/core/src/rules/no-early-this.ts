import type { Rule } from '../rule.js';
import type { Node } from '../syntax.js';

/**
 * In a constructor, and in the value a property is declared with, the object is not complete: a method called there
 * reads properties that have no value yet, and the compiler does not follow the call.
 */
export const noEarlyThis: Rule = {
  name: 'no-early-this',
  guarantee: 'typing',
  description:
    'In a constructor or in the value of a property, `this` is only read and written by its properties: no method of it is called and it is not handed over, since the object is not complete.',
  scope: 'safe',
  visit(node, { report }, parent, ancestors) {
    if (node.kind !== 'this' || parent === undefined) return;
    // The nearest function decides: a function written inside the constructor runs when it is called, later.
    const at = ancestors.findLastIndex((outer) => outer.kind === 'function' || outer.kind === 'property');
    const owner = ancestors[at];
    const builds = (outer: Node | undefined): boolean => outer !== undefined && ((outer.kind === 'function' && outer.isConstructor) || outer.kind === 'property');
    if (!builds(owner)) {
      // Unless it is given to a call made there: `parts.map(() => this.unit)` runs it at once.
      const taker = ancestors[at - 1];
      const given = owner !== undefined && taker !== undefined && (taker.kind === 'call' || taker.kind === 'new') && taker.arguments.includes(owner);
      if (!given || !builds(ancestors.slice(0, at - 1).findLast((outer) => outer.kind === 'function' || outer.kind === 'property'))) return;
      report(node, '`this` is used in a function given to a call while the object is being made: called at once, it reads a property that has no value yet.', 'Compute the value before the object is made, or keep the function in a property and call it once the object is made.');
      return;
    }
    const reads = (parent.kind === 'property-access' || parent.kind === 'element-access') && parent.object === node;
    const outer = ancestors.at(-2);
    const calls = reads && outer !== undefined && outer.kind === 'call' && outer.callee === parent;
    if (reads && !calls) return;
    report(
      calls ? parent : node,
      calls
        ? 'Method called while the object is being made: it can read a property that has no value yet.'
        : '`this` handed over while the object is being made: whoever gets it can read a property that has no value yet.',
      'Compute the value with a function that is given what it needs, and call the method once the object is made.',
    );
  },
};
