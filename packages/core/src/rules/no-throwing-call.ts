import type { Config } from '../config.js';
import type { Callee } from '../provider.js';
import type { Rule } from '../rule.js';
import { threatOf } from '../effects/ledger.js';
import { ledger } from '../effects/index.js';
import { runs } from '../unsafe/run.js';
import { isCaught, isTrusted } from './caught.js';


/** What makes a call a possible exception, or undefined when nothing is known against it. */
function threat(callee: Callee, argumentCount: number, plain: () => boolean, config: Config): string | undefined {
  if (callee.origin.kind === 'project') return undefined; // The rules read it: it obeys them too.
  // The console is the same object whoever declares it (the DOM library, the types of Node, a fixture).
  if (callee.name.startsWith('Console.') || callee.name.startsWith('console.')) return undefined;
  if (callee.origin.kind === 'package') {
    // An allowed package is trusted as the standard library of conforming code is.
    if (isTrusted(callee.origin.package, config)) return undefined;
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
  visit(node, { config, calleeOf, typeOf, valuesOf, report }, _parent, ancestors) {
    if (node.kind !== 'call' && node.kind !== 'new') return;
    const callee = calleeOf(node);
    if (callee === undefined) return;
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
    if (isCaught(node, ancestors, calleeOf, config)) return;
    const shown = callee.name === '' ? 'This call' : `\`${callee.name.replace(/\.$/, '').replace(/Constructor\b/, '')}\``;
    report(node, `${shown} ${why}.`, 'Call it inside `attempt(() => …, onError)` in an unsafe directory, so that the failure becomes a Result.');
  },
};
