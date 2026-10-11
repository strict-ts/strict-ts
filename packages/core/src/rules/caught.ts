import type { Config } from '../config.js';
import type { Callee } from '../provider.js';
import type { Node } from '../syntax.js';

const inside = (node: Node, outer: Node): boolean => outer.start <= node.start && node.end <= outer.end;

/** Whether a package is one the project allows: it is trusted as the standard library of conforming code is. */
export const isTrusted = (name: string | undefined, config: Config): boolean =>
  name !== undefined && config.allowedImports.some((allowed) => name === allowed || name.startsWith(`${allowed}/`));

/**
 * Whether what `node` throws is caught where it is: in the block of a `try` that has a `catch`, or in what is
 * handed to `attempt`.
 */
export function isCaught(node: Node, ancestors: readonly Node[], calleeOf: (node: Node) => Callee | undefined, config: Config): boolean {
  return ancestors.some((ancestor) => {
    if (ancestor.kind === 'try') return ancestor.hasCatch && inside(node, ancestor.block);
    if (ancestor.kind !== 'call' || !ancestor.arguments.some((argument) => inside(node, argument))) return false;
    const outer = calleeOf(ancestor);
    if (outer?.name !== 'attempt') return false;
    // `attempt` of the standard library, or the standard library's own when it is the project being checked.
    return outer.origin.kind === 'project' || (outer.origin.kind === 'package' && isTrusted(outer.origin.package, config));
  });
}
