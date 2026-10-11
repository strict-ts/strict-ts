import type { Rule } from '../rule.js';
import type { Node } from '../syntax.js';

/** The name at the start of `a.b[c].d`, when there is one. */
const rootOf = (node: Node): Node => (node.kind === 'property-access' || node.kind === 'element-access' ? rootOf(node.object) : node);

const HELP = 'Type what is given `Mut<…>` too, so that its own holder sees it change, or give a copy.';

export const mutFromReadonly: Rule = {
  name: 'mut-from-readonly',
  guarantee: 'mutability',
  description:
    'What is given where `Mut<…>` is asked for is the giver\'s to change: not a parameter that does not ask for mutation itself, not a value typed read-only.',
  scope: 'safe',
  visit(node, { typeOf, expectedOf, asksForMutation, report }) {
    // What can name a value someone else holds: a fresh literal or a `new` cannot.
    if (node.kind !== 'identifier' && node.kind !== 'property-access' && node.kind !== 'element-access') return;
    if (!asksForMutation(node)) return;
    const root = rootOf(node);
    if (root.kind === 'identifier' && root.parameter === 'readonly') {
      report(node, `Parameter \`${root.text}\` is given where \`Mut<…>\` is asked for, and does not ask for mutation itself.`, HELP);
      return;
    }
    const given = typeOf(node);
    const wanted = expectedOf(node);
    if (wanted === undefined) return;
    const writable = wanted.propertyNames.filter((name) => !wanted.readonlyProperties.includes(name));
    const frozen = given.readonlyProperties.filter((name) => writable.includes(name));
    if (frozen.length === 0) return;
    const names = frozen.slice(0, 3).map((name) => `\`${name}\``).join(', ');
    report(node, `A value typed read-only (${names}) is given where \`Mut<…>\` is asked for: a write there would change what its holder was told cannot change.`, HELP);
  },
};
