import type { Rule } from '../rule.js';

export const noOverload: Rule = {
  name: 'no-overload',
  guarantee: 'typing',
  description:
    'Forbids overload signatures: the compiler does not check that the implementation returns what each one promises, so one of them can be a cast.',
  scope: 'safe',
  visit(node, { report }) {
    if (node.kind !== 'function' || !node.isOverload) return;
    report(
      node,
      'Overload signature forbidden: nothing checks that the implementation keeps this promise.',
      'Write one signature whose return type follows from its parameters, or one function for each case.',
    );
  },
};
