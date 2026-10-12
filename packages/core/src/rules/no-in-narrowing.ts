import type { Rule } from '../rule.js';

export const noInNarrowing: Rule = {
  name: 'no-in-narrowing',
  guarantee: 'typing',
  description:
    '`in` does not choose between the members of a union: a value of one member may hold a property that only another names, with another type.',
  scope: 'safe',
  visit(node, { typeOf, report }) {
    if (node.kind !== 'binary' || node.operator !== 'in') return;
    const holder = typeOf(node.right);
    if (holder.isAny || holder.members.length < 2) return;
    report(
      node,
      '`in` on a union: the member it picks is the one whose type names the property, and the value may be of another.',
      'Give each member a tag (`kind: "circle"`) and test the tag.',
    );
  },
};
