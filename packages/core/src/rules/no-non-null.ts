import type { Rule } from '../rule.js';

export const noNonNull: Rule = {
  name: 'no-non-null',
  guarantee: 'typing',
  description: 'Forbids the non-null assertion `x!` (the equivalent of a silent `.unwrap()`).',
  scope: 'safe',
  visit(node, { report }) {
    if (node.kind === 'non-null') {
      report(node, '`!` assertion forbidden.', 'Handle the `undefined` case explicitly, or return an Option.');
    }
  },
};
