import type { Mut } from '../mut.js';
import type { Rule } from '../rule.js';
import type { Node } from '../syntax.js';

/**
 * `let ready: string;` then a function that reads `ready`: the compiler checks that a variable has a value before
 * it is read on the path it follows, and takes it for granted inside a function, which may run at any time.
 */
export const noUnsetCapture: Rule = {
  name: 'no-unset-capture',
  guarantee: 'typing',
  description:
    'A variable declared with no value, and whose type has no `undefined`, is not used by a function: nothing shows it has a value when the function runs.',
  scope: 'safe',
  // In a test the runner gives the value before each case (`beforeEach`), in an order the rule cannot see.
  inTests: false,
  file({ file, typeOf, report }) {
    // The variables that wait for a value, by where they are declared.
    const waiting: Mut<Map<number, Node>> = mut(new Map());
    const collect = (node: Node): void => {
      if (node.kind === 'variable' && node.waitsForValue && node.name.kind === 'identifier') {
        const type = typeOf(node.name);
        if (!type.isAny && !type.kinds.includes('undefined')) waiting.set(node.start, node.name);
      }
      for (const child of node.children) collect(child);
    };
    collect(file.root);
    if (waiting.size === 0) return;

    const captured: Mut<Set<number>> = mut(new Set());
    const functions: Mut<Node[]> = mut([]);
    const look = (node: Node): void => {
      if (node.kind === 'identifier' && node.declaredAt !== undefined && waiting.has(node.declaredAt)) {
        const at = node.declaredAt;
        // Used in a function that does not hold the declaration: that function runs when its caller decides.
        if (functions.some((outer) => at < outer.start || at >= outer.end)) captured.add(at);
      }
      if (node.kind === 'function') functions.push(node);
      for (const child of node.children) look(child);
      if (node.kind === 'function') functions.pop();
    };
    look(file.root);

    for (const at of [...captured].toSorted((a, b) => a - b)) {
      const name = waiting.get(at);
      if (name === undefined) continue;
      report(
        name,
        'This variable is declared with no value and a function uses it: nothing shows it has one when the function runs.',
        'Give it a value where it is declared, or type it `T | undefined` and test it where it is read.',
      );
    }
  },
};
