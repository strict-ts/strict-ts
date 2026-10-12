import type { Type } from '../provider.js';
import type { Rule } from '../rule.js';
import type { Node } from '../syntax.js';

/** The name at the start of `a.b[c].d`, when there is one. */
const rootOf = (node: Node): Node => (node.kind === 'property-access' || node.kind === 'element-access' ? rootOf(node.object) : node);

/** What can be a value someone else holds: a name, a place, what a call gives back. An object written in place cannot. */
const mayBeHeld = (node: Node): boolean => node.kind === 'identifier' || node.kind === 'property-access' || node.kind === 'element-access' || node.kind === 'call';

/** How deep the properties of a type are compared. */
const DEPTH = 3;

/**
 * The properties that `given` says are read-only and `wanted` says can be written: those of the value itself, or
 * else those of the first of its properties that has some, with the path to them. The compiler does not compare
 * them: a read-only property is accepted where one that can be written is asked for.
 */
const thawed = (given: Type, wanted: Type, depth = 0): readonly string[] => {
  if (depth > DEPTH || given.text === wanted.text) return [];
  const frozen = given.readonlyProperties;
  const here = wanted.propertyNames.filter((name) => frozen.includes(name) && !wanted.readonlyProperties.includes(name));
  if (here.length > 0) return here;
  for (const name of wanted.propertyNames) {
    const inner = given.property(name);
    const asked = wanted.property(name);
    const below = inner === undefined || asked === undefined ? [] : thawed(inner, asked, depth + 1);
    if (below.length > 0) return below.map((path) => `${name}.${path}`);
  }
  return [];
};

/** The first of them, as a message shows them. */
const shown = (paths: readonly string[]): string =>
  paths
    .slice(0, 3)
    .map((path) => `\`${path}\``)
    .join(', ');

const HELP = 'Type what is given `Mut<…>` too, so that its own holder sees it change, or give a copy.';

export const mutFromReadonly: Rule = {
  name: 'mut-from-readonly',
  guarantee: 'mutability',
  description:
    'What is given where `Mut<…>` is asked for is the giver\'s to change: not a parameter that does not ask for mutation itself, not a value typed read-only. Wherever it is given: as an argument, a returned value, a property or an element of what is written in place, the right side of an assignment, the receiver of a method.',
  scope: 'safe',
  visit(node, { typeOf, expectedOf, asksForMutation, report }) {
    const frozenIn = (given: Node, wanted: Type, where: string): boolean => {
      const root = rootOf(given);
      if (root.kind === 'identifier' && root.parameter === 'readonly') {
        report(given, `Parameter \`${root.text}\` is given ${where}, and does not ask for mutation itself.`, HELP);
        return true;
      }
      const paths = thawed(typeOf(given), wanted);
      if (paths.length === 0) return false;
      report(given, `A value typed read-only (${shown(paths)}) is given ${where}: a write there would change what its holder was told cannot change.`, HELP);
      return true;
    };

    // A method that says `this: Mut<…>` writes its receiver.
    if (node.kind === 'call' && (node.callee.kind === 'property-access' || node.callee.kind === 'element-access')) {
      const receiver = typeOf(node.callee).mutableReceiver;
      if (receiver !== undefined && mayBeHeld(node.callee.object)) frozenIn(node.callee.object, receiver, 'to a method that asks for `this: Mut<…>`');
    }
    // A variable with no written type takes the type of its first value: it may be one that can be written.
    // Not a pattern on the left: `[a, b] = pair` copies what the pair holds.
    if (node.kind === 'binary' && node.operator === '=' && mayBeHeld(node.left) && mayBeHeld(node.right) && !asksForMutation(node.right)) {
      const paths = thawed(typeOf(node.right), typeOf(node.left));
      if (paths.length > 0) {
        report(node.right, `A value typed read-only (${shown(paths)}) is assigned to a place that can be written: a write there would change what its holder was told cannot change.`, HELP);
      }
      return;
    }
    if (!mayBeHeld(node)) return;
    const wanted = expectedOf(node);
    // A function that writes into its parameter, where a function that does not is asked for.
    if (wanted !== undefined && wanted.returns.length > 0) {
      const writes = typeOf(node).mutableParameters.find((index) => !wanted.mutableParameters.includes(index));
      if (writes !== undefined) {
        report(
          node,
          `A function whose parameter ${writes + 1} asks for \`Mut<…>\` is given where one that does not is asked for: it will be called with what its caller was told cannot change.`,
          'Give a function that does not write into what it receives, or ask for `Mut<…>` where the function is asked for.',
        );
        return;
      }
    }
    if (wanted === undefined || !asksForMutation(node)) return;
    frozenIn(node, wanted, 'where `Mut<…>` is asked for');
  },
};
