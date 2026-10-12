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

/** Whose it is, when a written object is not the function's own to change. */
type Owner = { readonly kind: 'parameter'; readonly name: string } | { readonly kind: 'this' } | { readonly kind: 'giver'; readonly call: Node };

/**
 * The owner of an object the function did not make and was not given to change: a read-only parameter (`p`,
 * `p.x`, `p[0].y`), `this` where it may not be written, a call of the project that gave it back; and the same
 * through a local name made from one. `below` counts how far under its name the object is: a new container of what
 * a parameter holds may be written itself, and not what it holds. `gives` says whether a call hands out something
 * its caller may write.
 */
const ownerOf = (object: Node, gives: (call: Node) => boolean, depth = 0, below = 0): Owner | undefined => {
  const { root, steps } = rootOf(object);
  // The object a method is called on is what it receives too: Rust's `&self`, unless it says `this: Mut<…>`.
  if (root.kind === 'this') return root.receiver === 'readonly' ? { kind: 'this' } : undefined;
  if (root.kind !== 'identifier' || depth > DEPTH) return undefined;
  if (root.parameter === 'readonly') return { kind: 'parameter', name: root.text };
  if (root.parameter === 'mutable') return undefined;
  for (const alias of root.aliasOf) {
    if (alias.as === 'copy' && steps + below === 0) continue;
    if (alias.as === 'result') {
      if (!gives(alias.place)) return { kind: 'giver', call: alias.place };
      continue;
    }
    const found = ownerOf(alias.place, gives, depth + 1, steps + below + (alias.as === 'part' ? 1 : 0));
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
    'A function changes only what it made, or what says it may be changed. Not a parameter, unless it asks for it with `Mut<T>`, Rust\'s `&mut`: by its name, by another name for it or for a part of it, by a function of the platform. Not the object a method is called on, unless the method says `this: Mut<…>`. Not what a function of the project gave back, unless its return type says `Mut<…>`.',
  scope: 'safe',
  visit(node, { typeOf, calleeOf, report }) {
    const help = 'Return a new value instead, or type the parameter `Mut<…>` so that callers see it is changed.';
    // A function of the project hands out something its caller may write only if its return type says `Mut<…>`.
    // What a library gives back is taken on trust: its types say nothing either way.
    const gives = (call: Node): boolean => {
      if (call.kind !== 'call') return true;
      const callee = calleeOf(call);
      return callee === undefined || callee.origin.kind !== 'project' || typeOf(call.callee).mutableReturn;
    };
    const refuse = (at: Node, object: Node, how: string): boolean => {
      const owner = ownerOf(object, gives);
      if (owner === undefined) return false;
      const { root } = rootOf(object);
      const name = root.kind === 'identifier' ? root.text : '';
      if (owner.kind === 'giver') {
        const giver = (calleeOf(owner.call)?.name ?? '').replace(/\.$/, '');
        report(
          at,
          `\`${name}\` is mutated${how}, and ${giver === '' ? 'the function' : `\`${giver}\``} that gave it does not say it may be: its return type has no \`Mut<…>\`.`,
          'Write `Mut<…>` in the return type of the function, so that it says it hands out something to change; or change a copy.',
        );
        return true;
      }
      const through = owner.kind === 'parameter' && name !== owner.name ? `, through \`${name}\`` : owner.kind === 'this' && name !== '' ? `, through \`${name}\`` : '';
      if (owner.kind === 'this') {
        report(
          at,
          `\`this\` is mutated${how}${through}, in a function that does not say \`this: Mut<…>\`.`,
          'Write `this: Mut<…>` as its first parameter, so that callers see it changes its object; or return a new value.',
        );
        return true;
      }
      report(at, `Parameter \`${owner.name}\` is mutated${how}${through}.`, help);
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
    // A method that says it writes its object.
    if (typeOf(node.callee).mutableReceiver !== undefined) {
      refuse(node, object, ` by \`${name}\`, which says \`this: Mut<…>\``);
      return;
    }
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
