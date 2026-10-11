import type { Rule } from '../rule.js';
import type { Node } from '../syntax.js';

/** The expressions through which an `any` enters: reported once, at the innermost one. */
const producesValue = (node: Node): boolean =>
  node.kind === 'call' ||
  node.kind === 'new' ||
  node.kind === 'property-access' ||
  node.kind === 'element-access' ||
  node.kind === 'await';

export const noAny: Rule = {
  name: 'no-any',
  guarantee: 'typing',
  description: 'Forbids `any`, written or inferred (JSON.parse for instance), outside unsafe/.',
  scope: 'safe',
  visit(node, { typeOf, report }, parent) {
    if (node.kind === 'any-keyword') {
      report(node, '`any` is forbidden.', 'Use `unknown`, then narrow the type with a guard.');
      return;
    }
    // A name that refers to a value of type `any` declared elsewhere (a declaration file, an allowed package).
    if (node.kind === 'identifier') {
      if (!node.declaredOutside || !typeOf(node).isAny) return;
      if (parent !== undefined && producesValue(parent) && typeOf(parent).isAny) return;
      report(node, `\`${node.text}\` has type \`any\`.`, 'Wrap it in unsafe/ and give it a checked type.');
      return;
    }
    if (!producesValue(node) || !typeOf(node).isAny) return;
    if (parent !== undefined && producesValue(parent) && typeOf(parent).isAny) return;
    report(
      node,
      'This expression has type `any` (inferred).',
      'Move the call into unsafe/ and return a validated Result<unknown, E>.',
    );
  },
};
