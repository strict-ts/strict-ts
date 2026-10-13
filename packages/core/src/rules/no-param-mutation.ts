import type { Rule } from '../rule.js';
import type { Node } from '../syntax.js';

/** `=`, `+=`, `??=`… but not the comparisons that also end with `=`. */
const isAssignment = (operator: string): boolean => operator.endsWith('=') && !['==', '===', '!=', '!==', '<=', '>='].includes(operator);

/**
 * The methods that change what they are called on, for arrays, maps, sets, typed arrays and the nodes of a page. A
 * method of that name on another object is refused too: the rule cannot tell, and a mutation it lets through would
 * be worse.
 */
const MUTATORS = new Set([
  // Arrays, maps, sets, typed arrays.
  'push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin', 'set', 'add', 'delete', 'clear',
  // An iterator is used up by being read.
  'next',
  // The nodes of a page, its lists of classes, its headers and its forms.
  'append', 'prepend', 'appendChild', 'removeChild', 'replaceChildren', 'insertBefore', 'remove', 'toggle', 'removeAttribute',
  // What is drawn on a canvas changes it, and so does what moves or keeps its state.
  'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText', 'drawImage', 'putImageData', 'fill', 'stroke', 'clip', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'rect', 'ellipse', 'bezierCurveTo', 'quadraticCurveTo', 'save', 'restore', 'translate', 'rotate', 'scale', 'transform', 'resetTransform',
]);
/** `setTime`, `setFullYear`, `setAttribute`: a method named for what it sets. */
const SETTER = /^set[A-Z]/;
/** The functions of the platform that write into their first argument. */
const WRITERS: Readonly<Record<string, readonly string[]>> = {
  Object: ['assign', 'defineProperty', 'defineProperties', 'setPrototypeOf'],
  Reflect: ['set', 'defineProperty', 'deleteProperty', 'setPrototypeOf'],
};
const PRIMITIVES: readonly string[] = ['string', 'number', 'bigint', 'boolean', 'symbol', 'undefined', 'null'];
/** How far a name is followed through the names it was made from. */
const DEPTH = 8;

/** The name at the start of `a.b[c].d`, when there is one, and how many steps lead from it to the place. */
/** `table[name]`, or `table.name` when the name is not one the type declares: one of the things a list or a table holds. */
const isIndexed = (node: Node): boolean => node.kind === 'element-access' || (node.kind === 'property-access' && node.byIndex);
/**
 * The name at the start of `a.b[c].d`, the steps down from it, and how many of them, counted from the name, go
 * into a list before a property is read: 2 for `grid[0][0].total`, 0 for `world.torches[0]`.
 */
const rootOf = (node: Node, steps = 0, lists = 0): { readonly root: Node; readonly steps: number; readonly lists: number } =>
  node.kind === 'property-access' || node.kind === 'element-access' ? rootOf(node.object, steps + 1, isIndexed(node) ? lists + 1 : 0) : { root: node, steps, lists };

/** The kinds of expression that are a root themselves: asked directly. */
const ROOTS: readonly string[] = ['identifier', 'this', 'call', 'new', 'literal', 'function', 'string-literal', 'template'];
/** What an expression that is no root stands for: the values it chooses between, or the one it is written around. */
const through = (node: Node): readonly Node[] => {
  if (ROOTS.includes(node.kind)) return [];
  if (node.kind === 'conditional') return [node.whenTrue, node.whenFalse];
  if (node.kind === 'binary') return ['??', '||', '&&'].includes(node.operator) ? [node.left, node.right] : node.operator === '=' || node.operator === ',' ? [node.right] : [];
  // Parentheses, `await`, `!`: the one thing written inside. `satisfies` and `as`: the value, written first.
  return node.children.length === 1 ? node.children : node.kind === 'as' || node.kind === 'other' ? node.children.slice(0, 1) : [];
};

/** Whose it is, when a written object is not the function's own to change. */
export type Owner =
  | { readonly kind: 'parameter'; readonly name: string }
  | { readonly kind: 'this' }
  | { readonly kind: 'giver'; readonly call: Node }
  | { readonly kind: 'module'; readonly name: string }
  | { readonly kind: 'field'; readonly name: string }
  | { readonly kind: 'elements'; readonly name: string };

/** The name of a list, a map or a set whose written type says the container may be written, and not what it holds. */
export const closedElements = (container: Node): string | undefined => {
  if (container.kind === 'identifier') return container.elements === 'readonly' ? container.text : undefined;
  if (container.kind === 'property-access') return container.elements === 'readonly' ? container.name : undefined;
  // What a function of the project gives back: its return type says it, as the type of a field does.
  if (container.kind !== 'call' || container.elements !== 'readonly') return undefined;
  return container.callee.kind === 'property-access' ? container.callee.name : container.callee.kind === 'identifier' ? container.callee.text : 'the call';
};
/** The first list, on the way down to an object, that is read by position and does not say what it holds may be written. */
const closedList = (object: Node): string | undefined => {
  if (object.kind === 'element-access' || (object.kind === 'property-access' && object.byIndex)) return closedList(object.object) ?? closedElements(object.object);
  return object.kind === 'property-access' ? closedList(object.object) : undefined;
};

/** The first field, on the way down to an object, that the project declares and that does not say what it holds may be written. */
const closedField = (object: Node): string | undefined => {
  if (object.kind === 'property-access') return closedField(object.object) ?? (object.holds === 'readonly' ? object.name : undefined);
  return object.kind === 'element-access' ? closedField(object.object) : undefined;
};

/**
 * The owner of an object the function did not make and was not given to change: a read-only parameter (`p`,
 * `p.x`, `p[0].y`), `this` where it may not be written, a call of the project that gave it back; and the same
 * through a local name made from one. `below` counts how far under its name the object is: a new container of what
 * a parameter holds may be written itself, and not what it holds. `gives` says whether a call hands out something
 * its caller may write.
 */
export const ownerOf = (
  object: Node,
  gives: (call: Node) => boolean,
  isCopied: (node: Node) => boolean,
  depth = 0,
  below = 0,
  /** A list of numbers or texts: a new list of them holds nothing of the first. */
  isListOfCopies: (node: Node) => boolean = () => false,
  /** How many lists the object is inside of, counted from the names it was reached through. */
  inLists = 0,
): Owner | undefined => {
  const { root, steps, lists } = rootOf(object);
  // A list of lists says `Mut<…>` at each level: of the lists it holds, and of what those hold.
  const deep = root.kind === 'identifier' || root.kind === 'call' || root.kind === 'new' ? root.elementsDeep : [];
  // The lists the object is inside of count here only when nothing but lists stands between it and the name.
  const into = lists + (steps === lists ? inLists : 0);
  const closedDeep: Owner | undefined = deep.slice(0, into).includes('readonly')
    ? { kind: 'elements', name: root.kind === 'identifier' ? root.text : root.kind === 'call' && root.callee.kind === 'identifier' ? root.callee.text : root.kind === 'call' && root.callee.kind === 'property-access' ? root.callee.name : root.kind === 'new' && root.callee.kind === 'identifier' ? root.callee.text : 'the call' }
    : undefined;
  // A parameter that does not ask for mutation is said so first: that is what there is to change.
  if (closedDeep !== undefined && !(root.kind === 'identifier' && root.parameter === 'readonly')) return closedDeep;
  // A name for a number or a text names nothing that can be written: it was copied when it was given.
  if (root.kind === 'identifier' && isCopied(root)) return undefined;
  // The object a method is called on is what it receives too: Rust's `&self`, unless it says `this: Mut<…>`.
  if (root.kind === 'this' && root.receiver === 'readonly') return { kind: 'this' };
  // What a call gave, written with no name for it.
  if (root.kind === 'call' && !gives(root)) return { kind: 'giver', call: root };
  /**
   * What the path to the object goes through that is someone else's: a value another module made, reached as a
   * property of a namespace or of a class; a field declared with no type, made around something that is not the
   * object's own. `under` counts the steps from there down to the object.
   */
  const alongTheWay = (node: Node, under: number, listsUnder = 0, onlyLists = true): Owner | undefined => {
    if (node.kind === 'element-access') return alongTheWay(node.object, under + 1, listsUnder + 1, onlyLists);
    if (node.kind !== 'property-access') return undefined;
    // Above a property that is read by its name, the lists gone into below it are that property's, not this one's.
    const above = node.byIndex ? alongTheWay(node.object, under + 1, listsUnder + 1, onlyLists) : alongTheWay(node.object, under + 1, 0, false);
    if (above !== undefined) return above;
    // A field that is a list of lists says `Mut<…>` at each level too.
    if (node.elementsDeep.slice(0, listsUnder + (onlyLists ? inLists : 0)).includes('readonly')) return { kind: 'elements', name: node.name };
    if (node.fromModule === 'readonly') return { kind: 'module', name: node.name };
    for (const alias of node.madeFrom) {
      if (isCopied(alias.place) || (alias.as === 'copy' && (under === 0 || isListOfCopies(alias.place)))) continue;
      const found = ownerOf(alias.place, gives, isCopied, depth + 1, under + below, isListOfCopies);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  /**
   * On the way down from a root that may be written: to write into what a field holds, the field says so, and to
   * write into what a list holds, the list says so inside its `Mut<…>`. What they were given then had to be
   * something to change. Asked last: whose the object is says more, when it is someone's.
   */
  const closed = (): Owner | undefined => {
    const reached = depth > DEPTH ? undefined : alongTheWay(object, 0);
    if (reached !== undefined) return reached;
    const field = closedField(object);
    if (field !== undefined) return { kind: 'field', name: field };
    const list = closedList(object);
    return list === undefined ? undefined : { kind: 'elements', name: list };
  };
  // An object that is one of several, or seen through something: `(flag ? x : y)`, `(x ?? y)`, `(kept = x)`,
  // `(await p)`, `(x satisfies Cart)`. Each of them is asked; and then the fields read on the way down from it.
  const seenThrough = depth > DEPTH ? [] : through(root);
  if (seenThrough.length > 0) return seenThrough.flatMap((one) => ownerOf(one, gives, isCopied, depth + 1, below + steps, isListOfCopies) ?? []).at(0) ?? closed();
  // What a name was made from; or, with no name for it, what a method of a collection hands out of what it holds.
  const aliases = root.kind === 'identifier' ? root.aliasOf : root.kind === 'call' || root.kind === 'new' || root.kind === 'literal' ? root.madeFrom : undefined;
  if (aliases === undefined || depth > DEPTH) return closed();
  if (root.kind === 'identifier' && root.parameter === 'readonly') {
    // `readonly Mut<Line>[]`: the list is not the function's to change, what it holds is.
    return steps + below > 0 && root.elements === 'writable' ? (closedDeep ?? closed()) : { kind: 'parameter', name: root.text };
  }
  if (root.kind === 'identifier' && root.parameter === 'mutable') return closed();
  // What another module made and exports with no `Mut<…>` is that module's to change.
  if (root.kind === 'identifier' && root.fromModule === 'readonly') return { kind: 'module', name: root.text };
  for (const alias of aliases) {
    // A number or a text that was put there is a copy of its own.
    if (isCopied(alias.place)) continue;
    if (alias.as === 'copy' && (steps + below === 0 || isListOfCopies(alias.place))) continue;
    if (alias.as === 'result') {
      if (!gives(alias.place)) return { kind: 'giver', call: alias.place };
      continue;
    }
    const found = ownerOf(alias.place, gives, isCopied, depth + 1, steps + below + (alias.as === 'part' || alias.as === 'element' ? 1 : 0), isListOfCopies, into + alias.levels);
    if (found !== undefined) return found;
    // One of the things a list holds: the list has to say they may be written.
    const list = alias.as === 'element' ? closedElements(alias.place) : undefined;
    if (list !== undefined) return { kind: 'elements', name: list };
  }
  return closed();
};

/** Whether a method of the platform changes its object, by its name. */
const changes = (name: string): boolean => MUTATORS.has(name) || SETTER.test(name);

/** The places a write changes: one for a plain assignment, each one a pattern names for `[a.b, c] = …`. */
const targetsOf = (left: Node): readonly Node[] =>
  left.kind === 'identifier' || left.kind === 'property-access' || left.kind === 'element-access' ? [left] : left.children.flatMap(targetsOf);

export const noParamMutation: Rule = {
  name: 'no-param-mutation',
  guarantee: 'mutability',
  description:
    'A function changes only what it made, or what says it may be changed. Not a parameter, unless it asks for it with `Mut<T>`, Rust\'s `&mut`: by its name, by another name for it or for a part of it, by a function of the platform. Not the object a method is called on, unless the method says `this: Mut<…>`. Not what a function of the project gave back, unless its return type says `Mut<…>`.',
  scope: 'safe',
  visit(node, { typeOf, calleeOf, report }) {
    const help = 'Return a new value instead, or type the parameter `Mut<…>` so that callers see it is changed.';
    // A function of the project hands out something its caller may write only if its return type says `Mut<…>`.
    // What a library gives back is taken on trust: its types say nothing either way.
    const gives = (call: Node): boolean => {
      if (call.kind !== 'call') return true;
      const callee = calleeOf(call);
      return callee === undefined || callee.origin.kind !== 'project' || typeOf(call.callee).mutableReturn;
    };
    const isCopied = (named: Node): boolean => typeOf(named).kinds.every((kind) => PRIMITIVES.includes(kind));
    const isListOfCopies = (named: Node): boolean => typeOf(named).element?.kinds.every((kind) => PRIMITIVES.includes(kind)) === true;
    const refuse = (at: Node, object: Node, how: string): boolean => {
      const owner = ownerOf(object, gives, isCopied, 0, 0, isListOfCopies);
      if (owner === undefined) return false;
      const { root } = rootOf(object);
      const name = root.kind === 'identifier' ? root.text : '';
      if (owner.kind === 'module') {
        report(at, `\`${owner.name}\` is mutated${how}: another module made it, and does not say it may be changed.`, 'Declare it with `Mut<…>` where it is exported, so that who reads it there sees it change; or export a function that changes it.');
        return true;
      }
      if (owner.kind === 'field') {
        report(
          at,
          `What the field \`${owner.name}\` holds is mutated${how}, and the field does not say it may be: its type has no \`Mut<…>\`.`,
          'Type the field `Mut<…>`: what it is given then has to be something that may be changed. Or change a copy.',
        );
        return true;
      }
      if (owner.kind === 'elements') {
        report(
          at,
          `What \`${owner.name}\` holds is mutated${how}, and its type says the container may be written, not what it holds.`,
          'Say it inside the container too (`Mut<Mut<Line>[]>`, `readonly Mut<Line>[]`): what is put in it then has to be something that may be changed. Or change a copy.',
        );
        return true;
      }
      if (owner.kind === 'giver') {
        const giver = (calleeOf(owner.call)?.name ?? '').replace(/\.$/, '');
        report(
          at,
          `${name === '' ? 'What a call gave' : `\`${name}\``} is mutated${how}, and ${giver === '' ? 'the function' : `\`${giver}\``} that gave it does not say it may be: its return type has no \`Mut<…>\`.`,
          'Write `Mut<…>` in the return type of the function, so that it says it hands out something to change; or change a copy.',
        );
        return true;
      }
      const alias = owner.kind === 'parameter' && name !== owner.name && name !== '' ? `, through \`${name}\`` : owner.kind === 'this' && name !== '' ? `, through \`${name}\`` : '';
      if (owner.kind === 'this') {
        report(
          at,
          `\`this\` is mutated${how}${alias}, in a function that does not say \`this: Mut<…>\`.`,
          'Write `this: Mut<…>` as its first parameter, so that callers see it changes its object; or return a new value.',
        );
        return true;
      }
      report(at, `Parameter \`${owner.name}\` is mutated${how}${alias}.`, help);
      return true;
    };
    const lefts =
      node.kind === 'binary' && isAssignment(node.operator)
        ? targetsOf(node.left)
        : node.kind === 'update' || node.kind === 'delete'
          ? [node.operand]
          : node.kind === 'loop' && node.target !== undefined
            ? targetsOf(node.target)
            : [];
    for (const written of lefts) {
      if (written.kind === 'identifier') {
        // The name itself is given another value: that changes nothing for a caller unless it is the parameter.
        if (written.parameter === 'readonly') report(node, `Parameter \`${written.text}\` is reassigned.`, help);
        continue;
      }
      if ((written.kind === 'property-access' || written.kind === 'element-access') && refuse(node, written.object, '')) return;
    }
    // `list['push'](…)`: a method reached by a key. One the project wrote says itself whether it writes its
    // object; of the library, a name that is written is read like any other, and one that is computed is not known.
    if (node.kind === 'call' && node.callee.kind === 'element-access') {
      const reached = typeOf(node.callee);
      const index = node.callee.index;
      // `list[Symbol.iterator]()` makes something that goes through the list, and changes nothing of it.
      if (index.kind === 'property-access' && index.object.kind === 'identifier' && index.object.text === 'Symbol') return;
      const key = index.kind === 'string-literal' ? index.text : undefined;
      if (reached.mutableReceiver !== undefined || (!reached.isImplemented && (key === undefined || changes(key)) && !typeOf(node.callee.object).kinds.every((kind) => PRIMITIVES.includes(kind)))) {
        refuse(node, node.callee.object, key === undefined ? ' by a method reached by a key that is computed' : ` by \`${key}\``);
      }
      return;
    }
    if (node.kind !== 'call' || node.callee.kind !== 'property-access') return;
    const { name, object } = node.callee;
    const [first] = node.arguments;
    // `reset.call(given)`: a function that says it writes its object, given its object as an argument.
    if ((name === 'call' || name === 'apply' || name === 'bind') && first !== undefined && typeOf(object).mutableReceiver !== undefined) {
      refuse(node, first, ` by \`${name}\` of a function that says \`this: Mut<…>\``);
      return;
    }
    // A method that says it writes its object.
    if (typeOf(node.callee).mutableReceiver !== undefined) {
      refuse(node, object, ` by \`${name}\`, which says \`this: Mut<…>\``);
      return;
    }
    // `Array.prototype.push.call(list, …)`, and `apply`, and `bind` which keeps it for later: a method that
    // changes its object, given its object as an argument.
    if (['call', 'apply', 'bind'].includes(name) && first !== undefined && object.kind === 'property-access' && changes(object.name) && !typeOf(object).isImplemented) {
      refuse(node, first, ` by \`${name}\` of \`${object.name}\``);
      return;
    }
    const [, second] = node.arguments;
    if (object.kind === 'identifier' && object.text === 'Reflect' && name === 'apply' && first !== undefined && second !== undefined && typeOf(first).mutableReceiver !== undefined) {
      refuse(node, second, ' by `Reflect.apply` of a function that says `this: Mut<…>`');
      return;
    }
    if (object.kind === 'identifier' && object.text === 'Reflect' && name === 'apply' && first?.kind === 'property-access' && second !== undefined && changes(first.name)) {
      refuse(node, second, ` by \`Reflect.apply\` of \`${first.name}\``);
      return;
    }
    if (object.kind === 'identifier' && first !== undefined && (WRITERS[object.text] ?? []).includes(name)) {
      refuse(node, first, ` by \`${object.text}.${name}\``);
      return;
    }
    // A method written in the project says itself whether it writes its object: its name is not asked. One that
    // is only declared (in an interface) says nothing of what stands behind it.
    if (typeOf(node.callee).isImplemented) return;
    if (!changes(name)) return;
    // A text or a number has no method that changes it.
    if (typeOf(object).kinds.every((kind) => PRIMITIVES.includes(kind))) return;
    refuse(node, object, ` by \`${name}\``);
  },
};
