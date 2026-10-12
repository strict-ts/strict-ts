import type { Rule } from '../rule.js';

/**
 * A promise that fails is an exception by another road: `await` throws it, and an async function that awaits it
 * fails with no `throw` written. Two things make one in safe code without a `throw`.
 */
export const noReject: Rule = {
  name: 'no-reject',
  guarantee: 'errors',
  description:
    'A promise is not made to fail: the callback of `new Promise` does not take the function that rejects it, and no object has a `then` of its own, which `await` would call.',
  scope: 'safe',
  visit(node, { report }) {
    if (node.kind === 'new' && node.callee.kind === 'identifier' && node.callee.text === 'Promise' && node.callee.declaredOutside) {
      const [executor] = node.arguments;
      const rejects = executor?.kind === 'function' ? executor.parameters[1] : undefined;
      if (rejects !== undefined) {
        report(rejects, 'The callback of a promise takes the function that makes it fail: awaited, that failure is an exception no type carries.', 'Resolve the promise with a Result: `resolve(err(reason))`.');
      }
      return;
    }
    const isThen = (node.kind === 'literal' && node.entries.some((entry) => entry.name === 'then')) || (node.kind === 'property' && node.holdsValue && node.name === 'then') || (node.kind === 'function' && node.name === 'then');
    if (!isThen) return;
    report(node, 'A member named `then`: `await` calls it, and what it does with its second argument is a failure no type carries.', 'Give it another name, or return a real promise of a Result.');
  },
};
