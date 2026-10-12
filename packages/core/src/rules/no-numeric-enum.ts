import type { Rule } from '../rule.js';

export const noNumericEnum: Rule = {
  name: 'no-numeric-enum',
  guarantee: 'typing',
  description: 'Forbids an enum with a member that is a number: any number is accepted where such an enum is asked for.',
  scope: 'safe',
  visit(node, { report }) {
    if (node.kind !== 'enum' || !node.isNumeric) return;
    report(
      node,
      'Numeric enum forbidden: any number is accepted where it is asked for, a member or not.',
      "Give each member a text (`Low = 'low'`), or write a union of literals.",
    );
  },
};
