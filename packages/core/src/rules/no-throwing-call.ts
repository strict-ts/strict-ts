import type { Config } from '../config.js';
import type { Callee } from '../provider.js';
import type { Rule } from '../rule.js';
import type { Node } from '../syntax.js';
import { THROWING, THROWING_BELOW } from './throwing.js';

const inside = (node: Node, outer: Node): boolean => outer.start <= node.start && node.end <= outer.end;

const isTrusted = (name: string | undefined, config: Config): boolean =>
  name !== undefined && config.allowedImports.some((allowed) => name === allowed || name.startsWith(`${allowed}/`));

/** What makes a call a possible exception, or undefined when nothing is known against it. */
function threat(callee: Callee, argumentCount: number, config: Config): string | undefined {
  if (callee.origin.kind === 'project') return undefined; // The rules read it: it obeys them too.
  // The console is the same object whoever declares it (the DOM library, the types of Node), and does not throw.
  if (callee.name.startsWith('Console.') || callee.name.startsWith('console.')) return undefined;
  if (callee.origin.kind === 'package') {
    // An allowed package is trusted as the standard library of conforming code is.
    if (isTrusted(callee.origin.package, config)) return undefined;
    const from = callee.origin.package === undefined ? 'a declaration file' : `"${callee.origin.package}"`;
    return `is declared in ${from}, whose types do not say whether it throws`;
  }
  const always = THROWING[callee.name];
  if (always !== undefined) return always;
  const below = THROWING_BELOW[callee.name];
  return below !== undefined && argumentCount < below[0] ? below[1] : undefined;
}

export const noThrowingCall: Rule = {
  name: 'no-throwing-call',
  guarantee: 'errors',
  description:
    'A call that may throw without its type saying so is caught where it is made: inside `attempt`, or in a `try` with a `catch`.',
  scope: 'all',
  visit(node, { config, calleeOf, report }, _parent, ancestors) {
    if (node.kind !== 'call' && node.kind !== 'new') return;
    const callee = calleeOf(node);
    if (callee === undefined) return;
    const why = threat(callee, node.kind === 'call' ? node.arguments.length : node.argumentCount, config);
    if (why === undefined) return;
    // Caught where it is made: in the block of a `try` that has a `catch`, or in what is handed to `attempt`.
    const caught = ancestors.some((ancestor) => {
      if (ancestor.kind === 'try') return ancestor.hasCatch && inside(node, ancestor.block);
      if (ancestor.kind !== 'call' || !ancestor.arguments.some((argument) => inside(node, argument))) return false;
      const outer = calleeOf(ancestor);
      if (outer?.name !== 'attempt') return false;
      // `attempt` of the standard library, or the standard library's own when it is the project being checked.
      return outer.origin.kind === 'project' || (outer.origin.kind === 'package' && isTrusted(outer.origin.package, config));
    });
    if (caught) return;
    const shown = callee.name === '' ? 'This call' : `\`${callee.name.replace(/\.$/, '').replace(/Constructor\b/, '')}\``;
    report(node, `${shown} ${why}.`, 'Call it inside `attempt(() => …, onError)` in an unsafe directory, so that the failure becomes a Result.');
  },
};
