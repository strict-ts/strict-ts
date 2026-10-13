import type { Mut } from '../mut.js';
import type { FileContext, Rule } from '../rule.js';
import type { Node } from '../syntax.js';

/** What is known of an owned name at a point of the function. */
interface Owned {
  readonly name: string;
  readonly declaration: Node;
  /** How many constructs the analysis does not follow enclosed the declaration. */
  readonly depth: number;
  readonly status: 'owned' | 'given' | 'maybe';
}
type State = ReadonlyMap<number, Owned>;

const HELP_GIVE = 'Give it to a function whose parameter is typed `Once<…>`, or return it from a function whose return type is.';
const HELP_PLAIN = 'Give it away in plain sequence, or in both branches of an `if`.';

const join = (a: State, b: State): State => {
  const joined: Mut<Map<number, Owned>> = mut(new Map());
  for (const [key, owned] of a) {
    const other = b.get(key);
    if (other !== undefined) joined.set(key, owned.status === other.status ? owned : { ...owned, status: 'maybe' });
  }
  return joined;
};

/** Follows the owned names of one function, from its parameters to each of its ends. */
function follow(root: Node, { typeOf, expectedOf, report }: FileContext): void {
  let depth = 0;
  const refuseLost = (owned: Owned, at: Node, where: string): void => {
    if (owned.status !== 'given') report(at, `\`${owned.name}\` has one owner and is not given away ${where}: it would be lost.`, HELP_GIVE);
  };
  /** Any mention of an owned name inside a function that is not this one. */
  const captured = (node: Node, state: State): void => {
    if (node.kind === 'identifier' && node.declaredAt !== undefined && state.has(node.declaredAt)) {
      report(node, `\`${node.text}\` has one owner and is used from another function, which may run at any time.`, 'Pass it to that function as a parameter typed `Once<…>`.');
    }
    for (const child of node.children) captured(child, state);
  };
  const mention = (node: Node & { readonly kind: 'identifier' }, key: number, owned: Owned, parent: Node | undefined, state: State): State => {
    if (parent?.kind === 'variable' && parent.name === node) return state;
    if (owned.status !== 'owned') {
      report(node, `\`${node.text}\` is used after it ${owned.status === 'given' ? 'was' : 'may have been'} given away.`, 'A value with one owner is dead once it is given away.');
      return state;
    }
    // Through its members: borrowed for the time of the call.
    if (parent?.kind === 'property-access' && parent.object === node) return state;
    if (expectedOf(node)?.isOnce !== true) {
      report(node, `\`${node.text}\` has one owner: it is used through its members, or given away whole.`, HELP_GIVE);
      return state;
    }
    if (depth !== owned.depth) {
      report(node, `\`${node.text}\` is given away where the analysis does not follow: a loop, a \`try\`, a \`switch\`, a condition inside an expression.`, HELP_PLAIN);
      return state;
    }
    const next: Mut<Map<number, Owned>> = mut(new Map(state));
    next.set(key, { ...owned, status: 'given' });
    return next;
  };
  /** A value with one owner that is made here must be kept or given away where it is made. */
  const made = (node: Node, parent: Node | undefined): void => {
    if (node.kind !== 'call' && node.kind !== 'new' && node.kind !== 'await') return;
    if (parent?.kind === 'await' || !typeOf(node).isOnce) return;
    const kept = (parent?.kind === 'variable' && parent.initializer === node && parent.name.kind === 'identifier') || expectedOf(node)?.isOnce === true;
    if (!kept) report(node, 'A value with one owner is made here and not kept: it is lost at once.', 'Keep it in a `const`, or give it away.');
  };

  const run = (node: Node, parent: Node | undefined, state: State): { readonly state: State; readonly ended: boolean } => {
    made(node, parent);
    const inOrder = (children: readonly Node[], from: State): { readonly state: State; readonly ended: boolean } => {
      let current = from;
      for (const child of children) {
        const result = run(child, node, current);
        current = result.state;
        if (result.ended) return { state: current, ended: true };
      }
      return { state: current, ended: false };
    };
    switch (node.kind) {
      case 'function':
        captured(node, state);
        return { state, ended: false };
      case 'identifier': {
        const owned = node.declaredAt === undefined ? undefined : state.get(node.declaredAt);
        return { state: owned === undefined || node.declaredAt === undefined ? state : mention(node, node.declaredAt, owned, parent, state), ended: false };
      }
      case 'block': {
        const result = inOrder(node.children, state);
        const kept: Mut<Map<number, Owned>> = mut(new Map());
        for (const [key, owned] of result.state) {
          // A name declared in this block ends with it.
          if (state.has(key)) kept.set(key, owned);
          else if (!result.ended) refuseLost(owned, owned.declaration, 'on every path to the end of its block');
        }
        return { state: kept, ended: result.ended };
      }
      case 'variable': {
        const result = inOrder(node.initializer === undefined ? [] : [node.initializer], state);
        const name = node.name;
        if (name.kind !== 'identifier' || name.declaredAt === undefined || !typeOf(name).isOnce) return result;
        if (!node.isConst) report(name, `\`${name.text}\` has one owner and is declared with \`let\`: it could be given another value while the first is lost.`, 'Declare it with `const`.');
        const next: Mut<Map<number, Owned>> = mut(new Map(result.state));
        next.set(name.declaredAt, { name: name.text, declaration: name, depth, status: 'owned' });
        return { state: next, ended: result.ended };
      }
      case 'if': {
        const tested = run(node.condition, node, state);
        const then = run(node.whenTrue, node, tested.state);
        const otherwise = node.whenFalse === undefined ? { state: tested.state, ended: false } : run(node.whenFalse, node, tested.state);
        if (then.ended) return otherwise;
        return otherwise.ended ? then : { state: join(then.state, otherwise.state), ended: false };
      }
      case 'return': {
        const result = inOrder(node.expression === undefined ? [] : [node.expression], state);
        for (const owned of result.state.values()) refuseLost(owned, node, 'before this `return`');
        return { state: result.state, ended: true };
      }
      case 'throw':
        // What a throw drops is the business of the rules about exceptions.
        return { state: inOrder(node.children, state).state, ended: true };
      case 'binary':
        // Both sides run, once, in order; except where the right side waits on the left.
        if (!/^(?:&&|\|\||\?\?)=?$/.test(node.operator)) return inOrder(node.children, state);
        depth++;
        try {
          return { state: inOrder(node.children, state).state, ended: false };
        } finally {
          depth--;
        }
      case 'sequence':
      case 'expression-statement':
      case 'await':
      case 'call':
      case 'new':
      case 'property-access':
        return inOrder(node.children, state);
      default: {
        // Not followed: inside, a name may be used through its members and nothing more, and a `return` there does
        // not end the path outside.
        depth++;
        const result = inOrder(node.children, state);
        depth--;
        return { state: result.state, ended: false };
      }
    }
  };

  const owned: Mut<Map<number, Owned>> = mut(new Map());
  if (root.kind === 'function') {
    for (const parameter of root.parameters) {
      if (parameter.kind === 'identifier' && parameter.declaredAt !== undefined && typeOf(parameter).isOnce) {
        owned.set(parameter.declaredAt, { name: parameter.text, declaration: parameter, depth, status: 'owned' });
      }
    }
  }
  const body = root.kind === 'function' ? root.body : root;
  if (body === undefined) return;
  // An arrow whose body is an expression returns it.
  const result = body.kind === 'block' ? run(body, root, owned) : run(body, root.kind === 'function' ? { ...root, kind: 'return', expression: body } : root, owned);
  if (!result.ended) for (const left of result.state.values()) refuseLost(left, left.declaration, 'on every path to the end of the function');
}

export const useOnce: Rule = {
  name: 'use-once',
  guarantee: 'ownership',
  description:
    'A value typed `Once<…>` has one owner: it is used through its members, given away exactly once, and never lost.',
  scope: 'all',
  visit(node, context, parent) {
    // Each function is followed on its own, and the top level of a file as one.
    if (node.kind === 'function' || parent === undefined) follow(node, context);
  },
};
