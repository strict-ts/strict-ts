import type { Rule } from '../rule.js';
import type { Node } from '../syntax.js';

/** The functions of the library after which a write to their argument throws. */
const FREEZES = new Set(['ObjectConstructor.freeze', 'ObjectConstructor.seal', 'ObjectConstructor.preventExtensions', 'Reflect.preventExtensions']);

/** The expression inside its parentheses and its `as const`. */
const inner = (node: Node): Node => {
  const wrapped = node.kind === 'sequence' || (node.kind === 'as' && node.isConst) ? node.children[0] : undefined;
  return wrapped === undefined ? node : inner(wrapped);
};

export const freezeFresh: Rule = {
  name: 'freeze-fresh',
  guarantee: 'errors',
  description:
    'A value is frozen where it is made (`Object.freeze({ … })`), so that no name still says it can be changed: a write through such a name would throw.',
  scope: 'all',
  visit(node, { calleeOf, report }) {
    if (node.kind !== 'call') return;
    const callee = calleeOf(node);
    if (callee === undefined || callee.origin.kind !== 'library' || !FREEZES.has(callee.name)) return;
    const given = node.arguments[0];
    const fresh = given !== undefined && ['literal', 'new'].includes(inner(given).kind);
    if (fresh) return;
    report(
      node,
      `\`${callee.name.replace('Constructor', '')}\` is given a value that already has a name: a write through that name would throw.`,
      'Freeze the value where it is made: `const x = Object.freeze({ … })`. Its type is then read-only.',
    );
  },
};
