import type { Rule } from '../rule.js';
import type { Node } from '../syntax.js';

/** The methods that change how many elements an array holds. */
const RESIZES = ['push', 'pop', 'shift', 'unshift', 'splice'];

export const noResize: Rule = {
  name: 'no-resize',
  guarantee: 'typing',
  description:
    'An array gets no hole and a tuple keeps its length: the length of an array is not assigned, an array is not written by position, no element is deleted, none is made from a length alone, a tuple is not pushed into or popped.',
  scope: 'safe',
  visit(node, { typeOf, report }) {
    if (node.kind === 'binary' && node.operator === '=') {
      const left = node.left;
      if (left.kind === 'property-access' && left.name === 'length' && typeOf(left.object).isArray) {
        report(left, 'The length of an array is assigned: lengthened, it holds holes that are typed as elements.', 'Empty it with `splice(0)`, cut it with `splice(n)`, and add elements with `push`.');
        return;
      }
      // Written by position: directly, or as a piece of a pattern (`[a[i], a[j]] = …`). A tuple has its positions.
      const byPosition = (target: Node): boolean => {
        if (target.kind !== 'element-access') return false;
        const holder = typeOf(target.object);
        return holder.isArray && !holder.isTuple;
      };
      const written = left.kind === 'literal' ? left.children.filter(byPosition) : [left].filter(byPosition);
      for (const target of written) {
        report(target, 'An array is written by position: past its end, the write leaves holes that are typed as elements.', 'Replace the element with `splice(index, 1, value)`, which never leaves a hole, or build another array.');
      }
      return;
    }
    if (node.kind === 'delete') {
      const target = node.operand;
      if (target.kind === 'element-access' && typeOf(target.object).isArray) {
        report(node, 'An element of an array is deleted: it leaves a hole that is typed as an element.', 'Remove it with `splice(index, 1)`, which closes the gap.');
      }
      return;
    }
    // An object with a length and no element, taken for an array: `Array.from({ length: n })` makes n holes.
    if (node.kind === 'call' && node.callee.kind === 'property-access' && node.callee.name === 'from' && node.callee.object.kind === 'identifier' && node.callee.object.text === 'Array') {
      const [source] = node.arguments;
      if (source?.kind === 'literal' && source.entries.some((entry) => entry.name === 'length') && node.arguments.length < 2) {
        report(node, '`Array.from` of an object that only has a length: it makes that many holes, typed as elements.', 'Give the function that makes each element: `Array.from({ length: n }, (_, index) => …)`.');
      }
      return;
    }
    if (node.kind !== 'call' || node.callee.kind !== 'property-access' || !RESIZES.includes(node.callee.name)) return;
    if (!typeOf(node.callee.object).isTuple) return;
    report(node, `\`${node.callee.name}\` on a tuple: its type says how many elements it holds, and keeps saying it.`, 'Type it as an array if its length changes, or build another tuple.');
  },
};
