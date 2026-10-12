import type { Rule } from '../rule.js';

export const noKeyedWrite: Rule = {
  name: 'no-keyed-write',
  guarantee: 'typing',
  description:
    'A property is written through a key only when the key is one name, by an assignment or in an object written in place: with a key that stands for several, a value that fits one is written to another.',
  scope: 'safe',
  visit(node, { typeOf, expectedOf, report }) {
    if (node.kind === 'literal') {
      // `{ [key]: value }`: the compiler gives it the type of a table, which fits any type whose properties may be absent.
      const wanted = expectedOf(node);
      if (wanted !== undefined && wanted.isIndexed && wanted.propertyNames.length === 0) return;
      for (const entry of node.entries) {
        if (entry.key === undefined) continue;
        const key = typeOf(entry.key);
        const isOneName = key.members.length === 1 && key.members.every((member) => member.isLiteral);
        if (isOneName || key.text.includes('symbol')) continue;
        report(
          entry.key,
          'A property is written under a key that is not one name, in an object that is not a table: the value may fit the type of one property and be written to another.',
          'Write the property by its name, one branch for each (`switch` on the key), or give the object the type of a `Record`.',
        );
      }
      return;
    }
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
