import type { Type } from '../provider.js';
import type { Rule } from '../rule.js';
import type { Node } from '../syntax.js';
import { closedElements, ownerOf } from './no-param-mutation.js';

/** The name at the start of `a.b[c].d`, when there is one. */
const rootOf = (node: Node): Node => (node.kind === 'property-access' || node.kind === 'element-access' ? rootOf(node.object) : node);

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
          ? given.spreadFrom.flatMap((alias) => ownerOf(alias.place, gives, copied, 1, 1) ?? []).at(0)
          : ownerOf(given, gives, copied, 0, asksForMutationInside(given) ? 1 : 0);
      if (owner?.kind === 'parameter') {
        report(given, `Parameter \`${owner.name}\`, or a part of it, is given ${where}, and does not ask for mutation itself.`, HELP);
        return true;
      }
      if (owner?.kind === 'this') {
        report(given, `\`this\`, or a part of it, is given ${where}, in a function that does not say \`this: Mut<…>\`.`, 'Say `this: Mut<…>` on the method, so that it is called only on what may change; or give a copy.');
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

    // A method that says `this: Mut<…>` writes its receiver.
    if (node.kind === 'call' && (node.callee.kind === 'property-access' || node.callee.kind === 'element-access')) {
      const receiver = typeOf(node.callee).mutableReceiver;
      if (receiver !== undefined && mayBeHeld(node.callee.object)) frozenIn(node.callee.object, receiver, 'to a method that asks for `this: Mut<…>`', true);
    }
    // A variable with no written type takes the type of its first value: it may be one that can be written.
    // Not a pattern on the left: `[a, b] = pair` copies what the pair holds.
    if (node.kind === 'binary' && node.operator === '=' && mayBeHeld(node.left) && mayBeHeld(node.right) && !asksForMutation(node.right) && !isCopied(typeOf(node.right))) {
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
    if (call !== undefined && asks !== undefined) {
      const copied = (named: Node): boolean => isCopied(typeOf(named));
      const sources = [...(call.callee.kind === 'property-access' ? [call.callee.object] : []), ...call.arguments.filter((argument) => argument !== node && argument.kind !== 'function')];
      // Of a list, a map or a set, what it holds has to say so too; any other object hands out parts of itself.
      const isList = (source: Node): boolean => typeOf(source).element !== undefined || /^(Readonly)?(Map|Set|Array)</.test(typeOf(source).text);
      if (sources.some((source) => ownerOf(source, gives, copied, 0, 1) !== undefined || (isList(source) && closedElements(source) !== undefined))) {
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
    if (node.kind === 'function' || wanted === undefined || !asksForMutation(node)) return;
    if (isContainer && !asksForMutationInside(node)) return;
    frozenIn(node, wanted, 'where `Mut<…>` is asked for');
  },
};
