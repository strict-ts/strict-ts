import type { Type } from '../provider.js';
import type { Rule } from '../rule.js';

/** How deep the properties of a type are compared. */
const DEPTH = 3;

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

/**
 * The compiler carries `Mut<…>` and refuses what does not carry it where it is asked. Three things it lets
 * through are refused here, all of them about methods, whose parameters and `this` it compares both ways.
 */
export const mutFromReadonly: Rule = {
  name: 'mut-from-readonly',
  guarantee: 'mutability',
  description:
    'A method says no more of `Mut<…>` than the member it stands for: not `this: Mut<…>`, nor `Mut<…>` of a parameter, where the class it extends or the interface it implements does not; nor is an object given under a type whose methods say less. A method the language calls by itself (a loop, a conversion to text or to JSON, `await`) does not say `this: Mut<…>`. The compiler compares the parameters of methods both ways, and calls those of the language on whatever it is given.',
  scope: 'safe',
  visit(node, { typeOf, expectedOf, report }) {
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
        const more = own.mutableParameters.find((index) => !base.mutableParameters.includes(index));
        if (own.mutableReceiver !== undefined && !base.mutableReceiver) {
          report(node, `\`${node.name ?? ''}\` says \`this: Mut<…>\`, and the member it stands for in a type its class extends or implements does not: called through that type, it changes an object its caller was told cannot change.`, 'Say `this: Mut<…>` on the member there too; or do not change the object here.');
          break;
        }
        if (more !== undefined) {
          report(node, `Parameter ${more + 1} of \`${node.name ?? ''}\` asks for \`Mut<…>\`, and the member it stands for in a type its class extends or implements does not: called through that type, it is given what its caller was told cannot change.`, 'Ask for `Mut<…>` on the member there too; or do not write into the parameter here.');
          break;
        }
      }
    }
    // An object given under a type whose methods say less of `Mut<…>` than its own.
    const held = node.kind === 'identifier' || node.kind === 'property-access' || node.kind === 'element-access' || node.kind === 'call' || node.kind === 'new' || node.kind === 'this';
    const wanted = held ? expectedOf(node) : undefined;
    if (wanted === undefined || typeOf(node).text === wanted.text) return;
    const where = louder(typeOf(node), wanted);
    if (where === undefined) return;
    report(
      node,
      `${where === '' ? 'What is given' : `\`${where}\` of what is given`} is a function that says more of \`Mut<…>\` than the one of the type it is given under: it writes its object or a parameter where that one does not.`,
      'Say `Mut<…>` in the type that is asked for too; or give a function that does not write.',
    );
  },
};
