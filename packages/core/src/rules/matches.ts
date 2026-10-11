import type { Mut } from '../mut.js';

/** A place where a pattern matches: where it starts, the whole match and its groups. */
export interface Match {
  readonly index: number;
  readonly text: string;
  readonly groups: readonly (string | undefined)[];
}

/**
 * Every match of a global pattern in a text, without `matchAll`, which throws on a pattern that lacks the `g` flag.
 * A pattern without it gives no match here rather than an exception. The pattern's own position is used and left at
 * its end: hence `Mut`.
 */
export function matchesOf(text: string, pattern: Mut<RegExp>): readonly Match[] {
  if (!pattern.global) return [];
  const found: Mut<Match[]> = [];
  pattern.lastIndex = 0;
  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    found.push({ index: match.index, text: match[0], groups: match.slice(1) });
    // An empty match does not move the pattern forward: step over it.
    if (match[0] === '') pattern.lastIndex += 1;
  }
  return found;
}
