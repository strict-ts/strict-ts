import type { Rule } from '../rule.js';
import { isOption, isResult } from './types.js';

export const mustUse: Rule = {
  name: 'must-use',
  guarantee: 'errors',
  description: 'A Result, an Option or a Promise cannot be ignored (to drop one on purpose: `void expr`).',
  scope: 'all',
  visit(node, { typeOf, report }) {
    if (node.kind !== 'expression-statement' || node.expression.kind === 'void') return;
    const type = typeOf(node.expression);
    if (type.isPromise) {
      report(node.expression, 'Promise ignored (neither awaited nor handled).', 'Add `await`, or `void` to drop it on purpose.');
    } else if (isResult(type)) {
      report(
        node.expression,
        'Result ignored: its possible error is lost.',
        'Handle it with `match` or `if (r.ok)`, or `void` to drop it on purpose.',
      );
    } else if (isOption(type)) {
      report(node.expression, 'Option ignored.', 'Use the value, or `void` to drop it on purpose.');
    }
  },
};
