import type { Rule } from '../rule.js';

export const noNonNull: Rule = {
  name: 'no-non-null',
  guarantee: 'typing',
  description: 'Forbids the non-null assertion `x!` (a silent `.unwrap()`) and the definite assignment `x!: T`.',
  scope: 'safe',
  visit(node, { report }) {
    if (node.kind === 'non-null') {
      report(node, '`!` assertion forbidden.', 'Handle the `undefined` case explicitly, or return an Option.');
    } else if (node.kind === 'definite-assignment') {
      report(node, 'Definite assignment `!:` forbidden.', 'Give the value where it is declared, or type it as possibly undefined.');
    }
  },
};
