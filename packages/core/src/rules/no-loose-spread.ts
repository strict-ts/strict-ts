import type { Rule } from '../rule.js';
import type { Node } from '../syntax.js';

const isWritten = (node: Node): boolean => node.kind === 'literal' || (node.kind === 'conditional' && isWritten(node.whenTrue) && isWritten(node.whenFalse));

/**
 * What is spread may hold properties its type does not name. They are copied too: over a property written before
 * the spread, and into a property the result may have and that nothing else gives.
 */
export const noLooseSpread: Rule = {
  name: 'no-loose-spread',
  guarantee: 'typing',
  description:
    'A spread does not write a property its type does not name: no property is written before it unless the spread names it, and every optional property of the result is named by the spread or written after it.',
  scope: 'safe',
  visit(node, { typeOf, expectedOf, report }) {
    if (node.kind !== 'literal') return;
    const wanted = expectedOf(node);
    node.entries.forEach((entry, index) => {
      const spread = entry.spread;
      // An object written in place holds what is written and nothing else; so does a choice between two of them.
      if (spread === undefined || isWritten(spread)) return;
      const type = typeOf(spread);
      if (type.isAny) return;
      const named = type.propertyNames;
      const before = node.entries.slice(0, index).flatMap((earlier) => (earlier.name === undefined ? [] : [earlier.name]));
      const after = node.entries.slice(index + 1).flatMap((later) => (later.name === undefined ? [] : [later.name]));
      const covered = before.filter((name) => !named.includes(name) && !after.includes(name));
      const open = (wanted?.optionalProperties ?? []).filter((name) => !named.includes(name) && !after.includes(name));
      const [first] = [...covered, ...open];
      if (first === undefined) return;
      report(
        spread,
        covered.length > 0
          ? `A spread may write over \`${first}\`, written before it: what is spread can hold a property of that name that its type does not say.`
          : `A spread may fill \`${first}\`, which the result may have and nothing else gives: what is spread can hold a property of that name that its type does not say.`,
        'Write the properties after the spread, and those the result may have with it (`name: undefined` is not one: leave it out by naming what is copied).',
      );
    });
  },
};
