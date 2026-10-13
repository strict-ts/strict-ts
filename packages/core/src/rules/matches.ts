/** A place where a pattern matches: where it starts, the whole match and its groups. */
export interface Match {
  readonly index: number;
  readonly text: string;
  readonly groups: readonly (string | undefined)[];
}

/**
 * Every match of a global pattern in a text. `matchAll` throws on a pattern that lacks the `g` flag: one without
 * it gives no match here rather than an exception. It works on a copy of the pattern, which is left as it was.
 */
export function matchesOf(text: string, pattern: RegExp): readonly Match[] {
  if (!pattern.global) return [];
  try {
    return [...text.matchAll(pattern)].map((match) => ({ index: match.index, text: match[0], groups: match.slice(1) }));
  } catch {
    return [];
  }
}
