import { type Config, isUnsafe } from '../config.js';
import type { Callee } from '../provider.js';
import type { Rule } from '../rule.js';
import { quietAsWritten, threatOf } from '../effects/ledger.js';
import { ledger } from '../effects/index.js';
import { runs } from '../unsafe/run.js';
import { isCaught, isTrusted } from './caught.js';
import { isOption, isResult } from './types.js';


/** What makes a call a possible exception, or undefined when nothing is known against it. */
function threat(callee: Callee, argumentCount: number, plain: () => boolean, config: Config): string | undefined {
  if (callee.origin.kind === 'project') return undefined; // The rules read it: it obeys them too.
  // The console is the same object whoever declares it (the DOM library, the types of Node, a fixture).
  if (callee.name.startsWith('Console.') || callee.name.startsWith('console.')) return undefined;
  if (callee.origin.kind === 'package') {
    // An allowed package is trusted as the standard library of conforming code is, for all it exports: what is
    // imported from `vue` is trusted with it, although another package of its own declares it.
    if (isTrusted(callee.origin.package, config) || isTrusted(callee.importedFrom, config)) return undefined;
    const from = callee.origin.package === undefined ? 'a declaration file' : `"${callee.origin.package}"`;
    return `is declared in ${from}, whose types do not say whether it throws`;
  }
  // A function value whose type the library writes without a name (`resolve` in `new Promise((resolve) => …)`): the
  // type says nothing of what it does, and a value typed so in the project is accepted the same way.
  if (callee.name === '') return undefined;
  const effect = ledger[callee.name];
  // Not in the ledger: nothing shows that it does not throw.
  if (effect === undefined) return 'is not in the effects ledger: nothing shows that it does not throw';
  return threatOf(effect, argumentCount, effect.unprintable === true && plain(), config.assume?.includes('attached-buffers') === true, config.assume?.includes('dom-as-observed') === true);
}

const MOST = 16;

/**
 * Whether a call does not throw on the arguments written in it. Without a receiver, running the call says so. With
 * one, it is run on a list of receivers of the class, which is enough only for a project that says so.
 */
function neverThrowsAsWritten(name: string, written: readonly (readonly unknown[] | undefined)[], receiver: readonly unknown[] | undefined, config: Config): boolean {
  let lists: readonly (readonly unknown[])[] = [[]];
  for (const values of written) {
    // An argument whose values the compiler does not know: nothing to run.
    if (values === undefined) return false;
    lists = lists.flatMap((chosen) => values.map((value) => [...chosen, value]));
    if (lists.length > MOST) return false;
  }
  const outcome = runs(name, lists, receiver);
  if (!outcome.ok || !outcome.value.quiet) return false;
  return !outcome.value.hasReceiver || config.assume?.includes('generated-receivers') === true;
}

export const noThrowingCall: Rule = {
  name: 'no-throwing-call',
  guarantee: 'errors',
  description:
    'A call that may throw without its type saying so is caught where it is made: inside `attempt`, or in a `try` with a `catch`.',
  scope: 'all',
  inTests: false,
  visit(node, { file, config, calleeOf, typeOf, valuesOf, report }, _parent, ancestors) {
    // What an unsafe directory holds is not read by the rules: from safe code, only what says its failure is taken.
    const fromSafe = !isUnsafe(file.name, config);
    if (node.kind === 'property-access' && fromSafe && node.getterIn !== undefined && isUnsafe(node.getterIn, config)) {
      if (!isCaught(node, ancestors, calleeOf, config)) {
        report(node, `The getter \`${node.name}\` is written in an unsafe directory: reading it runs code that may throw.`, 'Export a function that returns a Result or an Option.');
      }
      return;
    }
    if (node.kind !== 'call' && node.kind !== 'new') return;
    const callee = calleeOf(node);
    if (callee === undefined) return;
    if (callee.origin.kind === 'project' && fromSafe && callee.declaredIn !== undefined && isUnsafe(callee.declaredIn, config)) {
      const given = typeOf(node).awaited;
      const says = node.kind === 'call' && (isResult(given) || isOption(given));
      if (says || isCaught(node, ancestors, calleeOf, config)) return;
      const shown = callee.name === '' ? 'This function' : `\`${callee.name}\``;
      report(
        node,
        node.kind === 'new'
          ? `${shown} builds a class written in an unsafe directory: its constructor may throw, and has no type to say so.`
          : `${shown} is written in an unsafe directory and does not return a Result or an Option: it may throw.`,
        node.kind === 'new' ? 'Export a function that builds it and returns a Result.' : 'Make it return a Result or an Option: it is the only way for a failure to cross the boundary.',
      );
      return;
    }
    // Whether everything the call is given is a plain value by its type: its receiver, and each of its arguments.
    const plain = (): boolean => {
      if (node.kind !== 'call') return false;
      const receiver = node.callee.kind === 'property-access' || node.callee.kind === 'element-access' ? [node.callee.object] : [];
      return [...receiver, ...node.arguments].every((given) => typeOf(given).isPlain);
    };
    const why = threat(callee, node.kind === 'call' ? node.arguments.length : node.argumentCount, plain, config);
    if (why === undefined) return;
    // Arguments that are all written in the call: the call is run, and what it does is known.
    const receiver = node.kind === 'call' && node.callee.kind === 'property-access' ? valuesOf(node.callee.object) : undefined;
    if (callee.origin.kind === 'library' && neverThrowsAsWritten(callee.name, node.arguments.map(valuesOf), receiver, config)) return;
    // The DOM cannot be run here: its calls were run in a browser, on arguments of the shapes the ledger names.
    const entry = callee.origin.kind === 'library' && node.kind === 'call' ? ledger[callee.name] : undefined;
    if (entry !== undefined && config.assume?.includes('dom-as-observed') === true && quietAsWritten(entry, node.arguments.map(valuesOf))) return;
    if (isCaught(node, ancestors, calleeOf, config)) return;
    const shown = callee.name === '' ? 'This call' : `\`${callee.name.replace(/\.$/, '').replace(/Constructor\b/, '')}\``;
    report(node, `${shown} ${why}.`, 'Call it inside `attempt(() => …, onError)` in an unsafe directory, so that the failure becomes a Result.');
  },
};
