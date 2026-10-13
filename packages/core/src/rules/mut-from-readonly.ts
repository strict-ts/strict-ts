import type { Type } from '../provider.js';
import type { Rule } from '../rule.js';
import type { Node } from '../syntax.js';
import { closedElements, ownerOf } from './no-param-mutation.js';

/** The name at the start of `a.b[c].d`, when there is one. */
const rootOf = (node: Node): Node => (node.kind === 'property-access' || node.kind === 'element-access' ? rootOf(node.object) : node);

/** The kinds of expression whose owner is asked: anything else around one is looked through. */
const HELD: readonly string[] = ['identifier', 'property-access', 'element-access', 'call', 'new', 'literal', 'this'];

/** An object, an array or an instance written in place. */
const isWritten = (node: Node): boolean => node.kind === 'literal' || node.kind === 'new';

/** What can be a value someone else holds: a name, a place, what a call gives back. An object written in place cannot. */
const mayBeHeld = (node: Node): boolean => node.kind === 'identifier' || node.kind === 'property-access' || node.kind === 'element-access' || node.kind === 'call' || node.kind === 'this';

/**
 * A number, a text, a boolean, nothing: copied when it is given. Nobody else holds what was given, and there is
 * nothing in it to write: `Mut<number>` on a field says the field is given other numbers.
 */
const PRIMITIVES: readonly string[] = ['string', 'number', 'bigint', 'boolean', 'symbol', 'undefined', 'null'];
const isCopied = (type: Type): boolean => type.kinds.every((kind) => PRIMITIVES.includes(kind));

/** How deep the properties of a type are compared. */
const DEPTH = 3;

/**
 * The properties that `given` says are read-only and `wanted` says can be written: those of the value itself, or
 * else those of the first of its properties that has some, with the path to them. The compiler does not compare
 * them: a read-only property is accepted where one that can be written is asked for.
 */
const thawed = (given: Type, wanted: Type, depth = 0): readonly string[] => {
  if (depth > DEPTH || given.text === wanted.text) return [];
  // A list: what it holds, one for all.
  const held = given.element;
  const asked = wanted.element;
  if (held !== undefined && asked !== undefined) return thawed(held, asked, depth + 1).map((path) => `[…].${path}`);
  const frozen = given.readonlyProperties;
  const here = wanted.propertyNames.filter((name) => frozen.includes(name) && !wanted.readonlyProperties.includes(name));
  if (here.length > 0) return here;
  for (const name of wanted.propertyNames) {
    const inner = given.property(name);
    const asked = wanted.property(name);
    const below = inner === undefined || asked === undefined ? [] : thawed(inner, asked, depth + 1);
    if (below.length > 0) return below.map((path) => `${name}.${path}`);
  }
  return [];
};

/**
 * Where a function of `given` says more of `Mut<…>` than the one `wanted` has in the same place: the path to it,
 * `''` for the value itself. Looked for in the value, in what a list of it holds, and in its properties.
 */
const louder = (given: Type, wanted: Type, depth = 0, returns = true): string | undefined => {
  if (depth > DEPTH) return undefined;
  // Only a function type the project wrote says something by saying nothing. Two function types read the same
  // as text whether they say `Mut<…>` or not: they are compared before the texts are.
  // `Quiet | undefined`: the function among them.
  const functions = wanted.returns.length > 0 ? [wanted] : wanted.members.filter((member) => member.returns.length > 0);
  if (functions.length > 0 && given.returns.length > 0) {
    const more = (one: Type): boolean => given.mutableParameters.some((index) => !one.mutableParameters.includes(index)) || (given.mutableReceiver !== undefined && one.mutableReceiver === undefined);
    // And it hands out something to change only if it says so: one that does not is not given where one that
    // does is asked.
    const less = (one: Type): boolean => returns && one.mutableReturn && !given.mutableReturn;
    if (functions.some((one) => one.isWrittenInProject && (more(one) || less(one)))) return '';
    // Further in: what it hands out is compared the same way; what it takes, the other way round, since it is
    // the one asked for that will be given a function, and the one given that will call it.
    for (const one of functions) {
      const [handsOut] = given.returns;
      const [asksOut] = one.returns;
      if (handsOut !== undefined && asksOut !== undefined && louder(handsOut, asksOut, depth + 1, returns) !== undefined) return '';
      if (given.parameterTypes.some((taken, index) => { const asks = one.parameterTypes[index]; return asks !== undefined && louder(asks, taken, depth + 1, returns) !== undefined; })) return '';
    }
    return undefined;
  }
  // A promise, by what it resolves to; a map or a set, by what `forEach` gives its function first.
  if (given.isPromise && wanted.isPromise) return louder(given.awaited, wanted.awaited, depth + 1, returns) === undefined ? undefined : '';
  const each = (of: Type): Type | undefined => of.property('forEach')?.parameterTypes[0]?.parameterTypes[0];
  const heldBy = given.element === undefined ? each(given) : undefined;
  const askedBy = wanted.element === undefined ? each(wanted) : undefined;
  if (heldBy !== undefined && askedBy !== undefined && louder(heldBy, askedBy, depth + 1, returns) !== undefined) return '[…]';
  if (given.text === wanted.text) return undefined;
  const held = given.element;
  const asked = wanted.element;
  if (held !== undefined && asked !== undefined) return louder(held, asked, depth + 1, returns) === undefined ? undefined : '[…]';
  for (const name of wanted.propertyNames) {
    const inner = given.property(name);
    const outer = wanted.property(name);
    if (inner !== undefined && outer !== undefined && louder(inner, outer, depth + 1, returns) !== undefined) return name;
  }
  return undefined;
};

/** The first of them, as a message shows them. */
const shown = (paths: readonly string[]): string =>
  paths
    .slice(0, 3)
    .map((path) => `\`${path}\``)
    .join(', ');

const HELP = 'Type what is given `Mut<…>` too, so that its own holder sees it change, or give a copy.';

export const mutFromReadonly: Rule = {
  name: 'mut-from-readonly',
  guarantee: 'mutability',
  description:
    'What is given where `Mut<…>` is asked for is the giver\'s to change: not a parameter that does not ask for mutation itself, not a value typed read-only. Wherever it is given: as an argument, a returned value, a property or an element of what is written in place, the right side of an assignment, the receiver of a method.',
  scope: 'safe',
  visit(node, { typeOf, expectedOf, asksForMutation, asksForMutationInside, calleeOf, report }, parent) {
    // As no-param-mutation asks it: a function of the project hands out something to write only if it says so.
    // Two functions that differ only by `Mut<…>` are one type for the compiler: the names are followed instead,
    // to each function the one that is called may be.
    const candidates = (callee: Node, depth: number): readonly Node[] => {
      if (depth > 4) return [];
      if (callee.kind === 'conditional') return [...candidates(callee.whenTrue, depth + 1), ...candidates(callee.whenFalse, depth + 1)];
      if (callee.kind === 'binary' && ['??', '||', '&&', ','].includes(callee.operator)) return [...candidates(callee.left, depth + 1), ...candidates(callee.right, depth + 1)];
      // A parameter of a function given to `forEach` or `map` is one of the things those go through.
      if (callee.kind === 'identifier') return [callee, ...callee.aliasOf.flatMap((alias) => candidates(alias.place, depth + 1)), ...callee.fedFrom.flatMap((from) => candidates(from, depth + 1))];
      if (callee.kind === 'literal' || callee.kind === 'new') return callee.madeFrom.flatMap((alias) => candidates(alias.place, depth + 1));
      if (callee.kind === 'call') return [callee, ...callee.madeFrom.flatMap((alias) => candidates(alias.place, depth + 1))];
      if (callee.kind === 'element-access') return [callee, ...candidates(callee.object, depth + 1)];
      return callee.children.length === 1 ? candidates(callee.children[0] ?? callee, depth + 1) : [callee];
    };
    const plain = (named: Node): boolean => typeOf(named).element !== undefined && isCopied(typeOf(named).element ?? typeOf(named));
    const gives = (call: Node): boolean => {
      if (call.kind !== 'call') return true;
      const callee = calleeOf(call);
      return callee === undefined || callee.origin.kind !== 'project' || typeOf(call.callee).mutableReturn;
    };
    const frozenIn = (given: Node, wanted: Type, where: string, isReceiver = false): boolean => {
      if (isCopied(typeOf(given))) return false;
      const root = rootOf(given);
      // A receiver that is a parameter is no-param-mutation's to refuse: it follows other names for it too.
      if (!isReceiver && root.kind === 'identifier' && root.parameter === 'readonly') {
        report(given, `Parameter \`${root.text}\` is given ${where}, and does not ask for mutation itself.`, HELP);
        return true;
      }
      // What the types say first: a value typed read-only. A container written in place has no holder: what is
      // put in it is looked at where it is put.
      const paths = isWritten(given) ? [] : thawed(typeOf(given), wanted);
      if (paths.length > 0) {
        report(given, `A value typed read-only (${shown(paths)}) is given ${where}: a write there would change what its holder was told cannot change.`, HELP);
        return true;
      }
      // Given where it may be written, it is as good as written here: whose it is is asked the same way, through
      // other names for it and through what a collection hands out of what it holds.
      // A new container of the same things is the giver's own; the things are not. Where `Mut<…>` is asked of
      // what the container holds, one step down is counted from the start.
      const copied = (named: Node): boolean => isCopied(typeOf(named));
      // Of an object or an array written in place, only what is spread: what is put in it by name or by position
      // is given on its own, and looked at there.
      const owner = isReceiver
        ? undefined
        : given.kind === 'literal'
          ? given.spreadFrom.flatMap((alias) => ownerOf(alias.place, gives, copied, 1, 1, plain) ?? []).at(0)
          : ownerOf(given, gives, copied, 0, asksForMutationInside(given) ? 1 : 0, plain);
      if (owner?.kind === 'parameter') {
        report(given, `Parameter \`${owner.name}\`, or a part of it, is given ${where}, and does not ask for mutation itself.`, HELP);
        return true;
      }
      if (owner?.kind === 'this') {
        report(given, `\`this\`, or a part of it, is given ${where}, in a function that does not say \`this: Mut<…>\`.`, 'Say `this: Mut<…>` on the method, so that it is called only on what may change; or give a copy.');
        return true;
      }
      if (owner?.kind === 'module') {
        report(given, `\`${owner.name}\`, or a part of it, is given ${where}: another module made it, and does not say it may be changed.`, 'Declare it with `Mut<…>` where it is exported; or give a copy.');
        return true;
      }
      if (owner?.kind === 'giver') {
        report(given, `What a call gave is given ${where}, and the function that gave it does not say it may be changed: its return type has no \`Mut<…>\`.`, 'Write `Mut<…>` in the return type of that function; or give a copy.');
        return true;
      }
      if (owner?.kind === 'field') {
        report(given, `What the field \`${owner.name}\` holds is given ${where}, and the field does not say it may be changed: its type has no \`Mut<…>\`.`, 'Type the field `Mut<…>`; or give a copy.');
        return true;
      }
      if (owner?.kind === 'elements') {
        report(given, `What \`${owner.name}\` holds is given ${where}, and its type says the container may be written, not what it holds.`, 'Say it inside the container too (`Mut<Mut<Line>[]>`, `readonly Mut<Line>[]`); or give a copy.');
        return true;
      }
      return false;
    };

    // A method the language calls by itself runs on whatever is looped over, converted or awaited: nobody gave
    // it something to change.
    if (node.kind === 'function' && node.isProtocol && typeOf(node).mutableReceiver !== undefined) {
      report(node, 'A method the language calls by itself (a loop, a conversion to text or to JSON, `await`) says `this: Mut<…>`: it is run on an object whoever holds it was told cannot change.', 'Do not change the object there; or give the change a method of its own, with a name, that is called on purpose.');
    }
    // A method stands for the member of the same name under each type its class extends or implements: it does
    // not write what that member does not say it writes.
    if (node.kind === 'function' && node.overridden.length > 0) {
      const own = typeOf(node);
      for (const base of node.overridden) {
        const louder = own.mutableParameters.find((index) => !base.mutableParameters.includes(index));
        if (own.mutableReceiver !== undefined && !base.mutableReceiver) {
          report(node, `\`${node.name ?? ''}\` says \`this: Mut<…>\`, and the member it stands for in a type its class extends or implements does not: called through that type, it changes an object its caller was told cannot change.`, 'Say `this: Mut<…>` on the member there too; or do not change the object here.');
          break;
        }
        if (louder !== undefined) {
          report(node, `Parameter ${louder + 1} of \`${node.name ?? ''}\` asks for \`Mut<…>\`, and the member it stands for in a type its class extends or implements does not: called through that type, it is given what its caller was told cannot change.`, 'Ask for `Mut<…>` on the member there too; or do not write into the parameter here.');
          break;
        }
      }
    }
    // `zero.call(undefined, cart)`, `apply`, `bind`: a function that asks for `Mut<…>`, given its arguments another
    // way than by being called.
    if (node.kind === 'call' && node.callee.kind === 'property-access' && ['call', 'apply', 'bind'].includes(node.callee.name)) {
      const asked = typeOf(node.callee.object).mutableParameters;
      const [, ...given] = node.arguments;
      const copied = (named: Node): boolean => isCopied(typeOf(named));
      // `apply` is given them in a list; the others one by one, after the object.
      const written = node.callee.name === 'apply' ? given.slice(0, 1) : given.filter((_, index) => asked.includes(index));
      if (asked.length > 0 && written.some((one) => ownerOf(one, gives, copied, 0, node.callee.kind === 'property-access' && node.callee.name === 'apply' ? 1 : 0, plain) !== undefined)) {
        report(node, `A function that asks for \`Mut<…>\` is given, by \`${node.callee.name}\`, what this function may not change.`, HELP);
      }
    }
    // A function that makes no written promise of what it hands back, and hands back one of several functions,
    // one of which asks for `Mut<…>`: its caller sees a type that says nothing of it.
    const handsBack = parent?.kind === 'return' || (parent?.kind === 'function' && parent.body === node);
    if (handsBack && node.kind !== 'function' && expectedOf(node) === undefined && typeOf(node).returns.length > 0) {
      const all = candidates(node, 0);
      // Even when it is the only one here: another `return` may hand back one that says nothing.
      if (all.some((one) => typeOf(one).mutableParameters.length > 0 || typeOf(one).mutableReceiver !== undefined)) {
        report(node, 'A function that asks for `Mut<…>` is handed back by a function with no written return type: two functions that differ only by `Mut<…>` are one type for the compiler, and a caller may see the one that says nothing.', 'Write the return type, with `Mut<…>` on the parameter; or hand back functions that say the same.');
      }
    }
    // What a generator is sent by `next(value)` is given from wherever it is called, and nothing there says so.
    if (node.kind === 'function' && node.isSentMut) {
      report(node, 'A generator says `Mut<…>` of what it is sent: `next(value)` is a function of the library, and gives it whatever it is given.', 'Take what is to be changed as a parameter of the generator, typed `Mut<…>`; or change a copy.');
    }
    // One of several functions, chosen when it runs: an argument one of them may write is asked like any other.
    if (node.kind === 'call' && !node.hasSpread && node.callee.kind !== 'property-access') {
      const copied = (named: Node): boolean => isCopied(typeOf(named));
      const asked = [...new Set(candidates(node.callee, 0).flatMap((one) => typeOf(one).mutableParameters))];
      const loose = asked.flatMap((index) => node.arguments[index] ?? []).filter((given) => !asksForMutation(given));
      if (loose.some((given) => ownerOf(given, gives, copied, 0, 0, plain) !== undefined)) {
        report(node, 'What is called is one of several functions, and one of them asks for `Mut<…>` of an argument that this function may not change.', HELP);
      }
    }
    // `zero(...list)`, `new Holder(...list)`: what the list holds is given where `Mut<…>` may be asked.
    if ((node.kind === 'call' || node.kind === 'new') && node.hasSpread && typeOf(node.callee).mutableParameters.length > 0) {
      const copied = (named: Node): boolean => isCopied(typeOf(named));
      // What is spread is the one thing written under `...`.
      const spread = (one: Node): Node => (HELD.includes(one.kind) ? one : (one.children[0] ?? one));
      if (node.arguments.some((one) => ownerOf(spread(one), gives, copied, 0, 1, plain) !== undefined)) {
        report(node, 'A function that asks for `Mut<…>` is called with a list spread into its arguments, which holds what this function may not change.', HELP);
      }
    }
    // A method that says `this: Mut<…>` writes its receiver.
    if (node.kind === 'call' && (node.callee.kind === 'property-access' || node.callee.kind === 'element-access')) {
      const receiver = typeOf(node.callee).mutableReceiver;
      if (receiver !== undefined && mayBeHeld(node.callee.object)) frozenIn(node.callee.object, receiver, 'to a method that asks for `this: Mut<…>`', true);
    }
    // A variable with no written type takes the type of its first value: it may be one that can be written.
    // Not a pattern on the left: `[a, b] = pair` copies what the pair holds.
    if (node.kind === 'binary' && node.operator === '=' && mayBeHeld(node.left) && mayBeHeld(node.right) && !asksForMutation(node.right) && !isCopied(typeOf(node.right))) {
      const quieter = louder(typeOf(node.right), typeOf(node.left));
      if (quieter !== undefined) {
        report(node.right, 'A function that says `Mut<…>` of its object or of a parameter is assigned to a place whose type says a function that does not: called from there, it changes what its caller was told cannot change.', 'Say `Mut<…>` in the type of the place too; or assign a function that does not write.');
        return;
      }
      const paths = thawed(typeOf(node.right), typeOf(node.left));
      if (paths.length > 0) {
        report(node.right, `A value typed read-only (${shown(paths)}) is assigned to a place that can be written: a write there would change what its holder was told cannot change.`, HELP);
      }
      return;
    }
    // A container written in place is nobody else's; what is put in it may be.
    const isContainer = isWritten(node);
    if (!mayBeHeld(node) && node.kind !== 'function' && !isContainer) return;
    const wanted = expectedOf(node);
    // A function that writes into its parameter, where a function that does not is asked for.
    // A function of the library or of a package says nothing of `Mut<…>`. One it is given calls it with what
    // its object holds (`forEach`, `then`, `traverse`) or with what it was given beside it (`Array.from(list, f)`):
    // the function may ask for `Mut<…>` when all of that is the caller's to change, down to what it holds.
    const call = parent?.kind === 'call' && parent.arguments.includes(node) && calleeOf(parent) !== undefined && calleeOf(parent)?.origin.kind !== 'project' ? parent : undefined;
    const [asks] = typeOf(node).mutableParameters;
    if (call !== undefined && asks !== undefined && !(wanted !== undefined && wanted.returns.length > 0 && wanted.isWrittenInProject)) {
      const copied = (named: Node): boolean => isCopied(typeOf(named));
      const sources = [...(call.callee.kind === 'property-access' ? [call.callee.object] : []), ...call.arguments.filter((argument) => argument !== node && argument.kind !== 'function')];
      // Of a list, a map or a set, what it holds has to say so too; any other object hands out parts of itself.
      const isList = (source: Node): boolean => typeOf(source).element !== undefined || /^(Readonly)?(Map|Set|Array)</.test(typeOf(source).text);
      if (sources.some((source) => ownerOf(source, gives, copied, 0, 1, plain) !== undefined || (isList(source) && closedElements(source) !== undefined))) {
        report(
          node,
          `A function whose parameter ${asks + 1} asks for \`Mut<…>\` is given to \`${call.callee.kind === 'property-access' ? call.callee.name : call.callee.kind === 'identifier' ? call.callee.text : 'a function'}\`, which calls it with what this function may not change.`,
          'Give a function that does not write into what it receives; or say `Mut<…>` where what it is called with comes from, down to what it holds.',
        );
      }
      return;
    }
    if (wanted !== undefined && wanted.returns.length > 0) {
      const writes = typeOf(node).mutableParameters.find((index) => !wanted.mutableParameters.includes(index));
      if (writes !== undefined) {
        report(
          node,
          `A function whose parameter ${writes + 1} asks for \`Mut<…>\` is given where one that does not is asked for: it will be called with what its caller was told cannot change.`,
          'Give a function that does not write into what it receives, or ask for `Mut<…>` where the function is asked for.',
        );
        return;
      }
    }
    // An object given under a type whose members say less of `Mut<…>` than its own: a method that says
    // `this: Mut<…>` where the type asked says none, a parameter that asks for it where the type asked does not.
    // Who holds it under that type calls them with what was not theirs to change.
    if (wanted !== undefined && node.kind !== 'function' && (typeOf(node).text !== wanted.text || typeOf(node).returns.length > 0)) {
      // Functions that differ only by `Mut<…>` are one type once they are in one list: each of them is looked
      // at by its name, against the function the type that is asked for says.
      const quiet = wanted.returns.length > 0 ? wanted : (wanted.element?.returns.length ?? 0) > 0 ? wanted.element : undefined;
      if (quiet !== undefined && quiet.isWrittenInProject && node.kind !== 'literal') {
        const one = candidates(node, 0).map((each) => typeOf(each)).find((each) => each.returns.length > 0 && (each.mutableParameters.some((index) => !quiet.mutableParameters.includes(index)) || (each.mutableReceiver !== undefined && quiet.mutableReceiver === undefined)));
        if (one !== undefined) {
          report(node, 'One of the functions this may be asks for `Mut<…>` of its object or of a parameter, and the type it is given under says a function that does not.', 'Say `Mut<…>` in the type that is asked for too; or give functions that do not write.');
          return;
        }
      }
      // What a function written in place gives back is looked at where it gives it.
      const where = louder(typeOf(node), wanted, 0, node.kind !== 'literal');
      if (where !== undefined) {
        report(
          node,
          `${where === '' ? 'What is given' : `\`${where}\` of what is given`} is a function that does not say of \`Mut<…>\` what the function of the type it is given under says: it writes its object or a parameter where that one does not, or hands out without \`Mut<…>\` what that one hands out to be changed.`,
          'Say `Mut<…>` in the type that is asked for too; or give a function that does not write.',
        );
        return;
      }
    }
    if (node.kind === 'function' || wanted === undefined || !asksForMutation(node)) return;
    if (isContainer && !asksForMutationInside(node)) return;
    frozenIn(node, wanted, 'where `Mut<…>` is asked for');
  },
};
