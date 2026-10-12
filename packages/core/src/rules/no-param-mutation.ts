import type { Rule } from '../rule.js';
import type { Node } from '../syntax.js';

/** `=`, `+=`, `??=`… but not the comparisons that also end with `=`. */
const isAssignment = (operator: string): boolean => operator.endsWith('=') && !['==', '===', '!=', '!==', '<=', '>='].includes(operator);

/**
 * The methods that change what they are called on, for arrays, maps, sets, typed arrays and the nodes of a page. A
 * method of that name on another object is refused too: the rule cannot tell, and a mutation it lets through would
 * be worse.
 */
const MUTATORS = new Set([
  // Arrays, maps, sets, typed arrays.
  'push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin', 'set', 'add', 'delete', 'clear',
  // The nodes of a page, its lists of classes, its headers and its forms.
  'append', 'prepend', 'appendChild', 'removeChild', 'replaceChildren', 'insertBefore', 'remove', 'toggle', 'removeAttribute',
]);
/** `setTime`, `setFullYear`, `setAttribute`: a method named for what it sets. */
const SETTER = /^set[A-Z]/;
/** The functions of the platform that write into their first argument. */
const WRITERS: Readonly<Record<string, readonly string[]>> = {
  Object: ['assign', 'defineProperty', 'defineProperties', 'setPrototypeOf'],
  Reflect: ['set', 'defineProperty', 'deleteProperty', 'setPrototypeOf'],
};
const PRIMITIVES: readonly string[] = ['string', 'number', 'bigint', 'boolean', 'symbol', 'undefined', 'null'];
/** How far a name is followed through the names it was made from. */
const DEPTH = 8;

/** The name at the start of `a.b[c].d`, when there is one, and how many steps lead from it to the place. */
const rootOf = (node: Node, steps = 0): { readonly root: Node; readonly steps: number } =>
  node.kind === 'property-access' || node.kind === 'element-access' ? rootOf(node.object, steps + 1) : { root: node, steps };

/**
 * The read-only parameter an object belongs to: `p`, `p.x`, `p[0].y`, and the same through a local name made from
 * it. `steps` counts how far below its name the object is: a new container of what a parameter holds may be
 * written itself, and not what it holds.
 */
const parameterOf = (object: Node, depth = 0, below = 0): string | undefined => {
  const { root, steps } = rootOf(object);
  if (root.kind !== 'identifier' || depth > DEPTH) return undefined;
  if (root.parameter === 'readonly') return root.text;
  if (root.parameter === 'mutable') return undefined;
  for (const alias of root.aliasOf) {
    if (alias.as === 'copy' && steps + below === 0) continue;
    const found = parameterOf(alias.place, depth + 1, steps + below + (alias.as === 'part' ? 1 : 0));
    if (found !== undefined) return found;
  }
  return undefined;
};

/** The places a write changes: one for a plain assignment, each one a pattern names for `[a.b, c] = …`. */
const targetsOf = (left: Node): readonly Node[] =>
  left.kind === 'identifier' || left.kind === 'property-access' || left.kind === 'element-access' ? [left] : left.children.flatMap(targetsOf);

export const noParamMutation: Rule = {
  name: 'no-param-mutation',
  guarantee: 'mutability',
  description:
    'A function does not change what it receives unless the parameter asks for it with `Mut<T>`, Rust\'s `&mut`: not by its name, not by another name for it or for a part of it, not by a function of the platform.',
  scope: 'safe',
  visit(node, { typeOf, report }) {
    const help = 'Return a new value instead, or type the parameter `Mut<…>` so that callers see it is changed.';
    const refuse = (at: Node, object: Node, how: string): boolean => {
      const parameter = parameterOf(object);
      if (parameter === undefined) return false;
      const { root } = rootOf(object);
      const through = root.kind === 'identifier' && root.text !== parameter ? `, through \`${root.text}\`` : '';
      report(at, `Parameter \`${parameter}\` is mutated${how}${through}.`, help);
      return true;
    };
    const lefts =
      node.kind === 'binary' && isAssignment(node.operator)
        ? targetsOf(node.left)
        : node.kind === 'update' || node.kind === 'delete'
          ? [node.operand]
          : node.kind === 'loop' && node.target !== undefined
            ? targetsOf(node.target)
            : [];
    for (const written of lefts) {
      if (written.kind === 'identifier') {
        // The name itself is given another value: that changes nothing for a caller unless it is the parameter.
        if (written.parameter === 'readonly') report(node, `Parameter \`${written.text}\` is reassigned.`, help);
        continue;
      }
      if ((written.kind === 'property-access' || written.kind === 'element-access') && refuse(node, written.object, '')) return;
    }
    if (node.kind !== 'call' || node.callee.kind !== 'property-access') return;
    const { name, object } = node.callee;
    const [first] = node.arguments;
    if (object.kind === 'identifier' && first !== undefined && (WRITERS[object.text] ?? []).includes(name)) {
      refuse(node, first, ` by \`${object.text}.${name}\``);
      return;
    }
    if (!MUTATORS.has(name) && !SETTER.test(name)) return;
    // A text or a number has no method that changes it.
    if (typeOf(object).kinds.every((kind) => PRIMITIVES.includes(kind))) return;
    refuse(node, object, ` by \`${name}\``);
  },
};
