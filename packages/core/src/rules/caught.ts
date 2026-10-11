import type { Config } from '../config.js';
import type { Callee } from '../provider.js';
import type { Node } from '../syntax.js';

const inside = (node: Node, outer: Node): boolean => outer.start <= node.start && node.end <= outer.end;

/** Whether a package is one the project allows: it is trusted as the standard library of conforming code is. */
export const isTrusted = (name: string | undefined, config: Config): boolean => {
  if (name === undefined) return false;
  // The types of a package may come in one of their own: `@types/react` for `react`, `@types/a__b` for `@a/b`.
  const typed = /^@types\/(?:([^_/]+)__)?([^/]+)(\/.*)?$/.exec(name);
  const real = typed === null ? name : `${typed[1] === undefined ? '' : `@${typed[1]}/`}${typed[2] ?? ''}${typed[3] ?? ''}`;
  return config.allowedImports.some((allowed) => real === allowed || real.startsWith(`${allowed}/`));
};

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
