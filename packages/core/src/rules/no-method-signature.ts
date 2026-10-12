import type { Rule } from '../rule.js';

export const noMethodSignature: Rule = {
  name: 'no-method-signature',
  guarantee: 'typing',
  description:
    'Forbids the method syntax in an interface or a type (`name(x: T): R`): its parameters are compared both ways, so an implementation that takes less is accepted.',
  scope: 'safe',
  visit(node, { report }) {
    if (node.kind !== 'method-signature') return;
    report(
      node,
      'Method signature forbidden: its parameters are compared both ways, so an implementation that takes less is accepted.',
      'Write it as a property with a function type, which is compared soundly: `name: (x: T) => R`.',
    );
  },
};
