import type { Rule } from '../rule.js';

export const noDefaultOnUndefined: Rule = {
  name: 'no-default-on-undefined',
  guarantee: 'typing',
  description:
    'A default is not written where the type lets `undefined` be given on purpose: the default would run, and what the caller gave would be lost. In a parameter, in a pattern, in an assignment by a pattern; and a function with a default is not given where one that takes `undefined` on purpose is asked for.',
  scope: 'safe',
  visit(node, { typeOf, expectedOf, report }) {
    // A function declared with a default, given where a function that takes `undefined` on purpose is asked for:
    // the type of the place says `undefined` arrives, and the default eats it.
    if (node.kind === 'identifier' || node.kind === 'property-access') {
      const wanted = expectedOf(node);
      if (wanted === undefined || wanted.returns.length === 0 || wanted.undefinedParameters.length === 0) return;
      const hidden = typeOf(node).defaultedParameters.find((index) => wanted.undefinedParameters.includes(index));
      if (hidden !== undefined) {
        report(
          node,
          `This function has a default for its parameter ${hidden + 1}, and is given where \`undefined\` may be passed there on purpose: the default would replace it.`,
          'Give a function that decides in its body what `undefined` means, or take `undefined` out of the type that is asked for.',
        );
      }
      return;
    }
    if (node.kind !== 'function' && node.kind !== 'variable' && node.kind !== 'binary') return;
    for (const hidden of node.hiddenDefaults) {
      report(
        hidden,
        'This default replaces an `undefined` that the type lets a caller give on purpose: it never arrives.',
        'Take `undefined` out of the type if it means « not given », or drop the default and decide in the body what `undefined` means.',
      );
    }
  },
};
