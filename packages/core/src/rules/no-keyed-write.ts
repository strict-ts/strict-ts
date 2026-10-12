import type { Rule } from '../rule.js';

export const noKeyedWrite: Rule = {
  name: 'no-keyed-write',
  guarantee: 'typing',
  description:
    'A property is written through a key only when the key is one name: with a key that stands for several, a value that fits one is written to another.',
  scope: 'all',
  visit(node, { typeOf, report }) {
    if (node.kind !== 'binary' || node.operator !== '=' || node.left.kind !== 'element-access') return;
    const holder = typeOf(node.left.object);
    // An array is written by position and a table by any name: their values all have one type.
    if (holder.isArray || holder.isIndexed || holder.isAny) return;
    const key = typeOf(node.left.index);
    if (key.members.every((member) => member.isLiteral)) return;
    report(
      node.left,
      'A property is written through a key that is not one name: the value may fit the type of one property and be written to another.',
      'Write the property by its name, one branch for each (`switch` on the key), or keep such values in a `Record`.',
    );
  },
};
