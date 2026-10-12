import type { Rule } from '../rule.js';

/**
 * The objects whose functions do not read `this`: the namespaces of the language, and the functions held by a
 * constructor (`Number.isInteger`, `Object.keys`). `Promise.resolve` is not one of them: it does read `this`.
 */
const reads = (owner: string): boolean =>
  owner === 'PromiseConstructor' || !(owner.endsWith('Constructor') || ['Math', 'JSON', 'Reflect', 'Atomics', 'Console', 'console'].includes(owner));

export const noUnboundMethod: Rule = {
  name: 'no-unbound-method',
  guarantee: 'typing',
  description: 'A method is called through its object: taken off it as a value, it loses `this`, and the call the types accept throws.',
  scope: 'safe',
  visit(node, { report }, parent) {
    if (node.kind !== 'property-access' || parent === undefined) return;
    // Called: `this` is the object. `object.method.bind(object)` gives it back.
    if (parent.kind === 'call' && parent.callee === node) return;
    if (parent.kind === 'property-access' && parent.object === node && ['bind', 'call', 'apply'].includes(parent.name)) return;
    // Written: `object.method = …` takes nothing off the object.
    if (parent.kind === 'binary' && parent.operator === '=' && parent.left === node) return;
    const owner = node.method;
    if (owner === undefined || !reads(owner)) return;
    report(
      node,
      'Method taken off its object: called this way it has no `this`.',
      'Call it through its object, in a function if a value is needed: `(…) => object.method(…)`.',
    );
  },
};
