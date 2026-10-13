import type { Mut } from '../mut.js';
import type { Rule } from '../rule.js';
import type { Node } from '../syntax.js';

/** The operators that write their left side. */
const WRITES = ['=', '+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>=', '>>>=', '&=', '|=', '^=', '&&=', '||=', '??='];

/** The operators that compare, and those that read their left side for its truth. */
const COMPARES = ['===', '!==', '==', '!='];
const CHOOSES = ['&&', '||', '??'];

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
  // A test reads a value after the call that changes it: that is what it is for, and no type of the program
  // comes out of it.
  inTests: false,
  file({ file, typeOf, calleeOf, report }) {
    // The variables a function other than the one that declares them writes: a call can change them.
    const written: Mut<Set<number>> = mut(new Set());
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

    /**
     * A call that cannot run code of the project: a function of the library given nothing but plain values. No
     * callback, no object whose conversion or getter could run. It changes nothing a test narrowed.
     */
    const keepsOut = (node: Node): boolean => {
      if (node.kind !== 'call') return false;
      const callee = calleeOf(node);
      if (callee === undefined || callee.origin.kind !== 'library') return false;
      const receiver = node.callee.kind === 'property-access' ? [node.callee.object] : [];
      return [...receiver, ...node.arguments].every((given) => (given.kind === 'identifier' && given.declaredOutside) || typeOf(given).isPlain);
    };
    /** Whether a child of a node is read there for a test: compared, read for its truth, chosen on by a switch that has a `default`. */
    const testsIt = (node: Node, child: Node, isTest: boolean): boolean => {
      if (node.kind === 'binary') return COMPARES.includes(node.operator) || (CHOOSES.includes(node.operator) && (isTest || child === node.left));
      if (node.kind === 'unary') return node.operator === '!';
      if (node.kind === 'if') return child === node.condition;
      if (node.kind === 'conditional') return child !== node.whenTrue && child !== node.whenFalse;
      // With no `default`, the compiler takes the cases for all there is: a value the stale test ruled out falls
      // through a switch it believes exhaustive. With one, that value goes there.
      if (node.kind === 'switch') return child === node.expression && node.clauses.some((clause) => clause.kind === 'default-clause');
      return node.kind === 'sequence' && isTest;
    };
    /** Whether a loop makes a call, in its own turns: not in a function written in it. */
    const callsIn = (node: Node): boolean =>
      node.kind !== 'function' && (node.kind === 'call' || node.kind === 'new' || node.kind === 'await' || node.children.some(callsIn));

    // One function at a time: where each path was last looked at, and where the calls of the function end.
    const walk = (body: Node): void => {
      const seen: Mut<Map<string, number>> = mut(new Map());
      const calls: Mut<Node[]> = mut([]);
      // The loops around what is being read whose turns make a call: what a turn does comes before the next one.
      const turning: Mut<Node[]> = mut([]);
      const visit = (node: Node, isTarget: boolean, isTest: boolean): void => {
        if (node.kind === 'function') {
          walk(node);
          return;
        }
        const writes = targets(node);
        const turns = node.kind === 'loop' && callsIn(node);
        // What a loop goes through is read once, before its first turn.
        const once = node.kind === 'loop' ? node.once : undefined;
        for (const child of node.children) {
          if (turns && child !== once) turning.push(node);
          visit(child, writes.includes(child), testsIt(node, child, isTest));
          if (turns && child !== once) turning.pop();
        }
        if ((node.kind === 'call' || node.kind === 'new' || node.kind === 'await') && !keepsOut(node)) calls.push(node);
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
        // A read that is a test reads the value as it is; so does one given where the whole declared type is
        // taken. Neither relies on what was said before, and neither says it again: what the compiler believes
        // after them still holds the old narrowing, so the look that counts stays the old one.
        if (isTest || node.takesDeclared) {
          if (last !== undefined) seen.set(path, last);
          return;
        }
        if (node.kind === 'property-access' && node.isGetter) {
          report(node, 'A getter is read as narrowed by a test: it is computed again at each read, and may answer something else.', 'Read it once into a constant, and test the constant.');
          return;
        }
        if (last === undefined || !canChange(node)) return;
        // A call between the last look and this read; or a look before a loop, whose earlier turn made one.
        const between = calls.some((call) => call.start >= last && call.end <= node.start);
        if (!between && !turning.some((loop) => last <= loop.start)) return;
        report(
          node,
          'This is read as narrowed by a test, after a call that could have changed it: the compiler does not look into the call.',
          'Read it into a constant before the call and use the constant, or test it again after the call.',
        );
      };
      for (const child of body.children) visit(child, false, false);
    };
    walk(file.root);
  },
};
