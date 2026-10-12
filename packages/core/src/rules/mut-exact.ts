import type { Rule } from '../rule.js';

export const mutExact: Rule = {
  name: 'mut-exact',
  guarantee: 'typing',
  description:
    'What is given where `Mut<…>` is asked for has exactly the type that is asked: under a wider one, a write puts in it what its holder was told it never holds.',
  scope: 'safe',
  visit(node, { asksForMutation, isWidened, report }) {
    // What can name a value someone else holds: a fresh literal or a `new` cannot.
    if (node.kind !== 'identifier' && node.kind !== 'property-access' && node.kind !== 'element-access') return;
    if (!asksForMutation(node) || !isWidened(node)) return;
    report(
      node,
      'A value is given where `Mut<…>` of a wider type is asked for: a write there puts in it what its own type does not allow.',
      'Ask for the type the value has, or give a copy of it.',
    );
  },
};
