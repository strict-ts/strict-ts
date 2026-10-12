import type { Mut } from '../mut.js';
import type { Rule } from '../rule.js';
import type { Node } from '../syntax.js';

/** The operators that write their left side. */
const WRITES = ['=', '+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>=', '>>>=', '&=', '|=', '^=', '&&=', '||=', '??='];

/** `a.b.c` for a chain of names: what a test narrows and a later read relies on. Nothing for anything else. */
const pathOf = (node: Node): string | undefined => {
  if (node.kind === 'identifier') return node.declaredAt === undefined ? undefined : `${node.text}@${node.declaredAt}`;
  if (node.kind === 'this') return 'this';
  if (node.kind !== 'property-access') return undefined;
  const holder = pathOf(node.object);
  return holder === undefined ? undefined : `${holder}.${node.name}`;
};

/**
 * A test narrows the type of a variable or of a property, and the compiler keeps the narrowing until it sees a
 * write. It does not see one made by a function that is called in between, nor the next answer of a getter.
 */
export const noStaleNarrowing: Rule = {
  name: 'no-stale-narrowing',
  guarantee: 'typing',
  description:
    'What a test narrowed is not relied on after something else could change it: a call or an `await` before the read of a variable another function writes or of a property that can be written, and any read of a getter.',
  scope: 'safe',
  file({ file, typeOf, report }) {
    // The variables a function other than the one that declares them writes: a call can change them.
    const written: Mut<Set<number>> = new Set();
    const targets = (node: Node): readonly Node[] => (node.kind === 'binary' && WRITES.includes(node.operator) ? [node.left] : node.kind === 'update' ? [node.operand] : []);
    const collect = (node: Node, functions: readonly Node[]): void => {
      for (const target of targets(node)) {
        const at = target.kind === 'identifier' ? target.declaredAt : undefined;
        if (at !== undefined && functions.some((outer) => at < outer.start || at >= outer.end)) written.add(at);
      }
      const inside = node.kind === 'function' ? [...functions, node] : functions;
      for (const child of node.children) collect(child, inside);
    };
    collect(file.root, []);

    /** Whether something else can change what `node` reads between two looks at it. */
    const canChange = (node: Node): boolean => {
      if (node.kind === 'identifier') return node.declaredAt !== undefined && written.has(node.declaredAt);
      return node.kind === 'property-access' && !typeOf(node.object).readonlyProperties.includes(node.name);
    };

    // One function at a time: where each path was last looked at, and where the calls of the function end.
    const walk = (body: Node): void => {
      const seen: Mut<Map<string, number>> = new Map();
      const calls: Mut<Node[]> = [];
      const visit = (node: Node, isTarget: boolean): void => {
        if (node.kind === 'function') {
          walk(node);
          return;
        }
        const writes = targets(node);
        for (const child of node.children) visit(child, writes.includes(child));
        if (node.kind === 'call' || node.kind === 'new' || node.kind === 'await') calls.push(node);
        // A write happens once its right side is computed: `cached = load()` is looked at after `load()` returns.
        for (const target of writes) {
          const path = pathOf(target);
          if (path !== undefined) seen.set(path, node.end);
        }
        if (node.kind !== 'identifier' && node.kind !== 'property-access') return;
        const path = pathOf(node);
        if (path === undefined) return;
        const last = seen.get(path);
        seen.set(path, node.end);
        if (isTarget || !node.isNarrowed) return;
        if (node.kind === 'property-access' && node.isGetter) {
          report(node, 'A getter is read as narrowed by a test: it is computed again at each read, and may answer something else.', 'Read it once into a constant, and test the constant.');
          return;
        }
        if (last === undefined || !canChange(node)) return;
        if (!calls.some((call) => call.start >= last && call.end <= node.start)) return;
        report(
          node,
          'This is read as narrowed by a test, after a call that could have changed it: the compiler does not look into the call.',
          'Read it into a constant before the call and use the constant, or test it again after the call.',
        );
      };
      for (const child of body.children) visit(child, false);
    };
    walk(file.root);
  },
};
