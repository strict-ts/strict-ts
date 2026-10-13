import type { Rule } from '../rule.js';
import { mayBeWritten } from './mutable.js';

/**
 * The compiler gives the mark of `Mut<…>` to a field whoever holds the object: `cart.items` is typed
 * `Mut<string[]>` under a `cart` that was given to read. Rust gives nothing to change through `&Cart`, and
 * neither does this: such a part is read through, and is not handed on as something to change.
 */
export const mutPath: Rule = {
  name: 'mut-path',
  guarantee: 'mutability',
  description:
    'A part typed `Mut<…>` of something that is not is read, and nothing else: a field, an element, or what a method of the platform hands out of its object. It is given where something to read is asked (`return this.entries` as `readonly string[]`); it is not given a name of its own, nor given, returned or looped over as something to change. To change it, the thing it is a part of says `Mut<…>` too.',
  scope: 'safe',
  visit(node, { typeOf, expectedOf, report }, parent) {
    const isPart = node.kind === 'property-access' || node.kind === 'element-access';
    const isHandedOut = node.kind === 'call' && node.callee.kind === 'property-access' && !typeOf(node.callee).isImplemented && !typeOf(node.callee).isWrittenInProject;
    if (!isPart && !isHandedOut) return;
    if (!typeOf(node).isMut || mayBeWritten(node, typeOf)) return;
    // Read through: a property of it, an element of it, a method called on it. What that gives is asked in its turn.
    if (parent !== undefined && (parent.kind === 'property-access' || parent.kind === 'element-access') && parent.object === node) return;
    // Given where something to read is asked (`return this.entries` as `readonly string[]`): the mark stops there.
    const wanted = expectedOf(node);
    if (wanted !== undefined && !wanted.isMut && !/\bMut</.test(wanted.text)) return;
    // Written into, or changed by a method: that is the other rule's to say.
    if (parent !== undefined && parent.kind === 'binary' && parent.left === node) return;
    report(
      node,
      'A part typed `Mut<…>` of something that is not typed `Mut<…>` is used as something to change: whoever gave the whole was told it cannot change.',
      'Type the whole `Mut<…>` where it comes from; or read what is needed out of the part here, and hand that on.',
    );
  },
};
