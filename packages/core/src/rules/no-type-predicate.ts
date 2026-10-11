import type { Rule } from '../rule.js';

export const noTypePredicate: Rule = {
  name: 'no-type-predicate',
  guarantee: 'typing',
  description: 'Forbids a written type predicate (`x is T`, `asserts x is T`): the compiler does not check it. Inferred ones stay.',
  scope: 'safe',
  visit(node, { report }) {
    if (node.kind !== 'type-predicate') return;
    if (node.asserts) {
      report(node, 'Assertion signature forbidden: nothing checks what it asserts.', 'Return a Result or an Option of the narrowed value.');
    } else {
      report(
        node,
        'Written type predicate forbidden: nothing checks that the body proves it.',
        'Remove the annotation and let the compiler infer the predicate, or parse the value with a schema.',
      );
    }
  },
};
