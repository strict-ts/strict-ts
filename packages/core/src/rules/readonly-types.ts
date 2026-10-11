import type { Rule } from '../rule.js';
import type { Node } from '../syntax.js';

/** The standard types that can be changed in place, and what to write instead. */
const MUTABLE: Readonly<Record<string, string>> = {
  Array: '`readonly T[]`',
  Map: '`ReadonlyMap<K, V>`',
  Set: '`ReadonlySet<T>`',
  Record: '`Readonly<Record<K, V>>`',
};

const isNamed = (node: Node | undefined, name: string): boolean => node?.kind === 'type-reference' && node.name === name;

export const readonlyTypes: Rule = {
  name: 'readonly-types',
  guarantee: 'mutability',
  description: 'A written type is read-only unless it asks for mutation with `Mut<…>`: arrays, maps, sets, records and properties.',
  scope: 'safe',
  visit(node, { report }, parent, ancestors) {
    // Everything under `Mut<…>` has asked.
    if (ancestors.some((ancestor) => isNamed(ancestor, 'Mut'))) return;
    const or = 'or wrap the type in `Mut<…>` when it is meant to change.';
    if (node.kind === 'array-type' && !node.isReadonly) {
      report(node, 'Mutable array type.', `Write \`readonly\` in front of it, ${or}`);
    } else if (node.kind === 'type-reference' && node.name in MUTABLE) {
      if (node.name === 'Record' && isNamed(parent, 'Readonly')) return;
      report(node, `Mutable type \`${node.name}\`.`, `Write ${MUTABLE[node.name] ?? ''}, ${or}`);
    } else if (node.kind === 'property' && !node.isReadonly && !node.asksForMutation) {
      report(
        { start: node.start, end: Math.min(node.end, node.start + Math.max(node.name.length, 1)) },
        `Property \`${node.name}\` can be reassigned.`,
        'Write `readonly` in front of it, or type it `Mut<…>` when it is meant to change.',
      );
    }
  },
};
