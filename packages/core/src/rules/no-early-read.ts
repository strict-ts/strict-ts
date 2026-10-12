import type { Mut } from '../mut.js';
import type { Rule } from '../rule.js';
import type { Node } from '../syntax.js';

/**
 * A constant has no value before its line runs, and reading it earlier throws. The compiler refuses a read that
 * is written above the declaration; it does not follow a function that is called above it and reads it, nor two
 * files that import each other, where the first to start reads what the second has not made yet.
 */
export const noEarlyRead: Rule = {
  name: 'no-early-read',
  guarantee: 'errors',
  description:
    'A value is not read before the line that gives it one: no function is used at the top of a file above a variable it reads, and the files of a project do not import each other in a circle.',
  scope: 'safe',
  file({ file, report }) {
    // What the file declares at its top, in the order written: its variables, and its functions with their bodies.
    const variables: Mut<Map<number, string>> = new Map();
    const functions: Mut<Map<number, Node>> = new Map();
    const statements: Mut<Node[]> = [];
    const top = (node: Node): void => {
      // A `let` at the top of a file is a statement of its own kind: what it declares is read as early as a constant.
      if (node.kind === 'sequence' || node.kind === 'block' || node.kind === 'module-state') for (const child of node.children) top(child);
      else if (node.kind === 'variable' && node.name.kind === 'identifier') {
        variables.set(node.start, node.name.text);
        if (node.initializer?.kind === 'function') functions.set(node.start, node.initializer);
        else statements.push(node);
      } else if (node.kind === 'function') functions.set(node.start, node);
      else statements.push(node);
    };
    for (const child of file.root.children) top(child);
    if (functions.size === 0 || variables.size === 0) return;

    // For each function: the variables of the top it reads, and the other functions of the top it names.
    const uses = new Map<number, { readonly reads: ReadonlySet<number>; readonly names: ReadonlySet<number> }>();
    for (const [at, body] of functions) {
      const reads: Mut<Set<number>> = new Set();
      const names: Mut<Set<number>> = new Set();
      const look = (node: Node): void => {
        if (node.kind === 'type-query') return;
        if (node.kind === 'identifier' && node.declaredAt !== undefined && node.declaredAt !== at) {
          if (functions.has(node.declaredAt)) names.add(node.declaredAt);
          else if (variables.has(node.declaredAt)) reads.add(node.declaredAt);
        }
        for (const child of node.children) look(child);
      };
      look(body);
      uses.set(at, { reads, names });
    }
    /** Every variable a function can reach, through the functions it names. */
    const reach = (start: number): ReadonlySet<number> => {
      const seen: Mut<Set<number>> = new Set([start]);
      const found: Mut<Set<number>> = new Set();
      const queue: Mut<number[]> = [start];
      for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
        const used = uses.get(next);
        for (const read of used?.reads ?? []) found.add(read);
        for (const named of used?.names ?? []) {
          if (!seen.has(named)) {
            seen.add(named);
            queue.push(named);
          }
        }
      }
      return found;
    };

    // A function named in what runs when the file starts may be called there, at once. In `typeof f`, written in
    // a type, nothing runs.
    const named = (node: Node): void => {
      if (node.kind === 'function' || node.kind === 'type-query') return;
      if (node.kind === 'identifier' && node.declaredAt !== undefined && functions.has(node.declaredAt)) {
        const late = [...reach(node.declaredAt)].filter((at) => at > node.start).toSorted((a, b) => a - b);
        const [first] = late;
        if (first !== undefined) {
          report(
            node,
            `\`${node.text}\` is used here, and reads \`${variables.get(first) ?? ''}\`, which is declared further down: called now, it reads a variable that has no value yet.`,
            'Declare what the function reads above the first place it is used.',
          );
        }
      }
      for (const child of node.children) named(child);
    };
    for (const statement of statements) named(statement);
  },
  project({ imports, report }) {
    // The files that can reach themselves by following imports.
    const reaches = (from: string): boolean => {
      const seen: Mut<Set<string>> = new Set();
      const queue: Mut<string[]> = [...(imports[from] ?? [])];
      for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
        if (next === from) return true;
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(...(imports[next] ?? []));
        }
      }
      return false;
    };
    for (const name of Object.keys(imports).toSorted()) {
      if (!reaches(name)) continue;
      report('This file imports a file that imports it back, directly or through others: whichever starts first reads what the other has not made yet.', 'Move what both need into a third file, or import only types (`import type`).', name);
    }
  },
};
