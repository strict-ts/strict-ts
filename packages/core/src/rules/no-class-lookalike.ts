import type { Rule } from '../rule.js';

export const noClassLookalike: Rule = {
  name: 'no-class-lookalike',
  guarantee: 'typing',
  description:
    'Where a class is asked for, the value is made by that class: an object that only has its shape is not one for `instanceof`, nor for its methods.',
  scope: 'safe',
  visit(node, { typeOf, expectedOf, report }) {
    if (node.kind !== 'literal' && node.kind !== 'identifier') return;
    const wanted = expectedOf(node);
    if (wanted === undefined || wanted.isAny || !wanted.members.some((member) => member.isClass)) return;
    // A member of what is asked that is a plain object may be what is meant.
    if (wanted.members.some((member) => !member.isClass && member.kinds.includes('object'))) return;
    const given = typeOf(node);
    // A member of the union that is not a class may be what is meant: only an object can be mistaken for one.
    if (given.isAny || given.members.every((member) => member.isClass || !member.kinds.includes('object'))) return;
    report(
      node,
      'An object that has the shape of a class is given where the class is asked for: `instanceof` will say it is not one.',
      'Make it with `new`, or ask for an interface where any object of that shape will do.',
    );
  },
};
