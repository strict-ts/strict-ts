import type { Rule } from '../rule.js';

export const noCast: Rule = {
  name: 'no-cast',
  guarantee: 'typing',
  description: 'Forbids type assertions (`as T`, `<T>x`) outside unsafe/. `as const` and `satisfies` stay allowed.',
  scope: 'safe',
  visit(node, { report }) {
    if (node.kind === 'as' && !node.isConst) {
      report(node, '`as` cast forbidden.', 'Use a type guard, `satisfies`, or validate the data in unsafe/.');
    } else if (node.kind === 'type-assertion') {
      report(node, '`<T>` cast forbidden.', 'Use a type guard or `satisfies`.');
    }
  },
};
