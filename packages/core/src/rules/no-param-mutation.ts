import type { Rule } from '../rule.js';
import type { Node } from '../syntax.js';
import { mayBeWritten } from './mutable.js';

const isAssignment = (operator: string): boolean => operator.endsWith('=') && !['==', '===', '!=', '!==', '<=', '>='].includes(operator);

/**
 * The methods that change what they are called on, for arrays, maps, sets, typed arrays and the nodes of a page. A
 * method the project wrote says it itself, with `this: Mut<…>`, and the compiler asks it of who calls it; of the
 * platform, the names are all there is to read.
 */
const MUTATORS = new Set([
  // Arrays, maps, sets, typed arrays.
  'push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin', 'set', 'add', 'delete', 'clear',
  // An iterator is used up by being read.
  'next',
  // The nodes of a page, its lists of classes, its headers and its forms.
  'append', 'prepend', 'appendChild', 'removeChild', 'replaceChildren', 'insertBefore', 'remove', 'toggle', 'removeAttribute',
  // What is drawn on a canvas changes it, and so does what moves or keeps its state.
  'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText', 'drawImage', 'putImageData', 'stroke', 'clip', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'rect', 'ellipse', 'bezierCurveTo', 'quadraticCurveTo', 'save', 'restore', 'translate', 'rotate', 'scale', 'transform', 'resetTransform',
]);
/** `setTime`, `setFullYear`, `setAttribute`: a method named for what it sets. */
const SETTER = /^set[A-Z]/;
/** Whether a method of the platform changes its object, by its name. */
const changes = (name: string): boolean => MUTATORS.has(name) || SETTER.test(name);
/** The functions of the platform that write into their first argument. */
const WRITERS: Readonly<Record<string, readonly string[]>> = {
  Object: ['assign', 'defineProperty', 'defineProperties', 'setPrototypeOf'],
  Reflect: ['set', 'defineProperty', 'deleteProperty', 'setPrototypeOf'],
};
const PRIMITIVES: readonly string[] = ['string', 'number', 'bigint', 'boolean', 'symbol', 'undefined', 'null'];

/** The places a write changes: one for a plain assignment, each one a pattern names for `[a.b, c] = …`. */
const targetsOf = (left: Node): readonly Node[] =>
  left.kind === 'identifier' || left.kind === 'property-access' || left.kind === 'element-access' ? [left] : left.children.flatMap(targetsOf);

const HELP = 'Type it `Mut<…>` where it comes from (a parameter, a field, what a function gives back), and make it with `mut(…)`; or change a copy.';

/**
 * A write goes through a type that says `Mut<…>`. The compiler carries the word and gives nothing there that does
 * not carry it too: so no name is followed here, and what is asked is the type of what is written.
 */
export const noParamMutation: Rule = {
  name: 'no-param-mutation',
  guarantee: 'mutability',
  description:
    'What is changed is typed `Mut<…>`: the object a property is assigned in or deleted from, the list an element is written in, the object a method of the platform changes, the first argument of a function of the platform that writes into it. Each step says so: under `order: Mut<Order>`, `order.cart.total = 0` asks that `cart` be declared `Mut<Cart>`. `this` is the object being made in a constructor, a setter and the value a field starts with; a part of a thing of the platform that says `Mut<…>` may be written, and so may what the platform holds for everyone (`document`, `process`).',
  scope: 'safe',
  visit(node, { typeOf, report }) {
    const writable = (object: Node): boolean => mayBeWritten(object, typeOf);
    const named = (object: Node): string => (object.kind === 'identifier' ? `\`${object.text}\`` : object.kind === 'this' ? '`this`' : object.kind === 'property-access' ? `\`${object.name}\`` : 'This');
    const refuse = (at: Node, object: Node, how: string): boolean => {
      if (writable(object)) return false;
      const why = object.kind === 'this' ? 'in a function that does not say `this: Mut<…>`' : 'and its type does not say `Mut<…>`';
      report(at, `${named(object)} is changed${how}, ${why}.`, object.kind === 'this' ? 'Say `this: Mut<…>` on the method, so that it is called only on what may change.' : HELP);
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
      if ((written.kind === 'property-access' || written.kind === 'element-access') && refuse(node, written.object, '')) return;
    }
    if (node.kind !== 'call') return;
    const [first, second] = node.arguments;
    // `list['push'](…)`: a method reached by a key. Of the platform, a name that is written is read like any
    // other, and one that is computed is not known.
    if (node.callee.kind === 'element-access') {
      const index = node.callee.index;
      // `list[Symbol.iterator]()` makes something that goes through the list, and changes nothing of it.
      if (index.kind === 'property-access' && index.object.kind === 'identifier' && index.object.text === 'Symbol') return;
      const key = index.kind === 'string-literal' ? index.text : undefined;
      const reached = typeOf(node.callee);
      const holder = typeOf(node.callee.object);
      // A function kept in a table is called, not a method of the table: what it writes, its own type says.
      if (key === undefined && holder.isIndexed && !holder.isArray && !holder.isTuple) return;
      // Nor is a function whose type the project wrote: that type says what it writes, and the compiler asks it.
      if (!reached.isImplemented && !reached.isWrittenInProject && (key === undefined || changes(key)) && !holder.kinds.every((kind) => PRIMITIVES.includes(kind))) {
        refuse(node, node.callee.object, key === undefined ? ' by a method reached by a key that is computed' : ` by \`${key}\``);
      }
      return;
    }
    if (node.callee.kind !== 'property-access') return;
    const { name, object } = node.callee;
    // `Array.prototype.push.call(list, …)`, `apply`, `bind`: a method of the platform that changes its object,
    // given its object as an argument. The library types these loosely, and the compiler asks nothing.
    if (['call', 'apply', 'bind'].includes(name) && first !== undefined && object.kind === 'property-access' && changes(object.name) && !typeOf(object).isImplemented) {
      refuse(node, first, ` by \`${name}\` of \`${object.name}\``);
      return;
    }
    if (object.kind === 'identifier' && object.text === 'Reflect' && name === 'apply' && first?.kind === 'property-access' && second !== undefined && changes(first.name) && !typeOf(first).isImplemented) {
      refuse(node, second, ` by \`Reflect.apply\` of \`${first.name}\``);
      return;
    }
    if (object.kind === 'identifier' && first !== undefined && (WRITERS[object.text] ?? []).includes(name)) {
      refuse(node, first, ` by \`${object.text}.${name}\``);
      return;
    }
    // A method the project wrote says itself whether it writes its object, and the compiler asks it of the call.
    // Not of `super.method()`, where it asks nothing: the object is this one.
    if (object.kind === 'this' && typeOf(node.callee).mutableReceiver !== undefined) {
      refuse(node, object, ` by \`${name}\`, which says \`this: Mut<…>\``);
      return;
    }
    if (typeOf(node.callee).isImplemented) return;
    if (!changes(name)) return;
    // A text or a number has no method that changes it.
    if (typeOf(object).kinds.every((kind) => PRIMITIVES.includes(kind))) return;
    refuse(node, object, ` by \`${name}\``);
  },
};
