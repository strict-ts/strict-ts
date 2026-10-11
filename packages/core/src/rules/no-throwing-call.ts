import type { Config } from '../config.js';
import type { Callee } from '../provider.js';
import type { Rule } from '../rule.js';
import { threatOf } from '../effects/ledger.js';
import { ledger } from '../effects/index.js';
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
  const effect = ledger[callee.name];
  // Not in the ledger: nothing shows that it does not throw.
  if (effect === undefined) return 'is not in the effects ledger: nothing shows that it does not throw';
  return threatOf(effect, argumentCount, effect.unprintable === true && plain(), config.assume?.includes('attached-buffers') === true, config.assume?.includes('dom-as-observed') === true);
}

export const noThrowingCall: Rule = {
  name: 'no-throwing-call',
  guarantee: 'errors',
  description:
    'A call that may throw without its type saying so is caught where it is made: inside `attempt`, or in a `try` with a `catch`.',
  scope: 'all',
  inTests: false,
  visit(node, { config, calleeOf, typeOf, report }, _parent, ancestors) {
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
    if (isCaught(node, ancestors, calleeOf, config)) return;
    const shown = callee.name === '' ? 'This call' : `\`${callee.name.replace(/\.$/, '').replace(/Constructor\b/, '')}\``;
    report(node, `${shown} ${why}.`, 'Call it inside `attempt(() => …, onError)` in an unsafe directory, so that the failure becomes a Result.');
  },
};
