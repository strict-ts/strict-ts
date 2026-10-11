import type { Rule } from '../rule.js';
import type { Node } from '../syntax.js';

/** `=`, `+=`, `??=`… but not the comparisons that also end with `=`. */
const isAssignment = (operator: string): boolean => operator.endsWith('=') && !['==', '===', '!=', '!==', '<=', '>='].includes(operator);

/**
 * The methods that change what they are called on, for arrays, maps, sets and typed arrays. A method of that name on
 * another object is refused too: the rule cannot tell, and a mutation it lets through would be worse.
 */
const MUTATORS = new Set(['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin', 'set', 'add', 'delete', 'clear']);

/** The name at the start of `a.b[c].d`, when there is one. */
const rootOf = (node: Node): Node => (node.kind === 'property-access' || node.kind === 'element-access' ? rootOf(node.object) : node);

/** The read-only parameter a place belongs to: `p`, `p.x`, `p[0].y`. */
const parameterOf = (place: Node): string | undefined => {
  const root = rootOf(place);
  return root.kind === 'identifier' && root.parameter === 'readonly' ? root.text : undefined;
};

export const noParamMutation: Rule = {
  name: 'no-param-mutation',
  guarantee: 'mutability',
  description: 'A function does not change what it receives unless the parameter asks for it with `Mut<T>`: Rust\'s `&mut`.',
  scope: 'safe',
  visit(node, { report }) {
    const help = 'Return a new value instead, or type the parameter `Mut<…>` so that callers see it is changed.';
    const written =
      node.kind === 'binary' && isAssignment(node.operator) ? node.left : node.kind === 'update' || node.kind === 'delete' ? node.operand : undefined;
    if (written !== undefined) {
      const parameter = parameterOf(written);
      if (parameter === undefined) return;
      const whole = written.kind === 'identifier';
      report(node, whole ? `Parameter \`${parameter}\` is reassigned.` : `Parameter \`${parameter}\` is mutated.`, help);
      return;
    }
    if (node.kind === 'call' && node.callee.kind === 'property-access' && MUTATORS.has(node.callee.name)) {
      const parameter = parameterOf(node.callee.object);
      if (parameter !== undefined) report(node, `Parameter \`${parameter}\` is mutated by \`${node.callee.name}\`.`, help);
    }
  },
};
