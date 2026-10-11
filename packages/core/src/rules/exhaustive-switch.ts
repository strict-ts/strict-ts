import type { Rule } from '../rule.js';

export const exhaustiveSwitch: Rule = {
  name: 'exhaustive-switch',
  guarantee: 'errors',
  description: 'A switch must cover every member of a finite union, or have a `default` otherwise.',
  scope: 'all',
  visit(node, { typeOf, report }) {
    if (node.kind !== 'switch' || node.clauses.some((clause) => clause.kind === 'default-clause')) return;
    const members = typeOf(node.expression).members;
    if (!members.every((member) => member.isLiteral)) {
      report(
        node.expression,
        'switch on a non-finite type without `default`.',
        'Add a `default`, or narrow the type to a union of literals.',
      );
      return;
    }
    const covered = new Set(
      node.clauses.flatMap((clause) => (clause.kind === 'case-clause' ? [typeOf(clause.expression).text] : [])),
    );
    const missing = members.map((member) => member.text).filter((text) => !covered.has(text));
    if (missing.length > 0) {
      report(node.expression, `Non-exhaustive switch, missing cases: ${missing.join(', ')}.`, 'Add the missing `case` clauses.');
    }
  },
};
