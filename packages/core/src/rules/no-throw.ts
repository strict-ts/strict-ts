import type { Rule } from '../rule.js';

export const noThrow: Rule = {
  name: 'no-throw',
  guarantee: 'errors',
  description: 'Forbids `throw` outside unsafe/: errors are values (Result).',
  scope: 'safe',
  inTests: false,
  visit(node, { report }) {
    if (node.kind === 'throw') {
      report(node, '`throw` is forbidden.', 'Return `err(...)` and declare the error in the type: Result<T, E>.');
    }
  },
};
