import type { Rule } from '../rule.js';
import { mayBeOption, mayBePromise, mayBeResult } from './types.js';

/** `r = f()` keeps the value, like `const r = f()`. */
const ASSIGNMENT = new Set(['=', '??=', '||=', '&&=']);

export const mustUse: Rule = {
  name: 'must-use',
  guarantee: 'errors',
  description: 'A Result, an Option or a Promise cannot be ignored (to drop one on purpose: `void expr`).',
  scope: 'all',
  visit(node, { typeOf, report }) {
    if (node.kind !== 'expression-statement' || node.expression.kind === 'void') return;
    if (node.expression.kind === 'binary' && ASSIGNMENT.has(node.expression.operator)) return;
    const type = typeOf(node.expression);
    if (mayBePromise(type)) {
      report(node.expression, 'Promise ignored (neither awaited nor handled).', 'Add `await`, or `void` to drop it on purpose.');
    } else if (mayBeResult(type)) {
      report(
        node.expression,
        'Result ignored: its possible error is lost.',
        'Handle it with `match` or `if (r.ok)`, or `void` to drop it on purpose.',
      );
    } else if (mayBeOption(type)) {
      report(node.expression, 'Option ignored.', 'Use the value, or `void` to drop it on purpose.');
    }
  },
};
