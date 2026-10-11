import type { Rule } from '../rule.js';

const EQUALITY = new Set(['===', '!==', '==', '!=']);

export const noNull: Rule = {
  name: 'no-null',
  guarantee: 'errors',
  description: 'Forbids `null` as a value or as a type (comparing with `=== null` stays allowed, to narrow an unknown).',
  scope: 'safe',
  visit(node, { report }, parent) {
    if (node.kind !== 'null-keyword') return;
    if (parent?.kind === 'binary' && EQUALITY.has(parent.operator)) return;
    report(node, '`null` is forbidden.', 'Use Option<T> (or `undefined` for an optional property).');
  },
};
