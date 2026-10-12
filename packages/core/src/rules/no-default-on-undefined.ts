import type { Rule } from '../rule.js';

export const noDefaultOnUndefined: Rule = {
  name: 'no-default-on-undefined',
  guarantee: 'typing',
  description: 'A default is not written where the type lets `undefined` be given on purpose: the default would run, and what the caller gave would be lost.',
  scope: 'safe',
  visit(node, { report }) {
    if (node.kind !== 'function' && node.kind !== 'variable') return;
    for (const hidden of node.hiddenDefaults) {
      report(
        hidden,
        'This default replaces an `undefined` that the type lets a caller give on purpose: it never arrives.',
        'Take `undefined` out of the type if it means « not given », or drop the default and decide in the body what `undefined` means.',
      );
    }
  },
};
