/** A replacement of `[start, end)` in a file's text; an insertion when the two are equal. */
export interface Edit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/** One automatic fix: the edits that make one refusal go away. They are applied together or not at all. */
export interface Fix {
  readonly rule: string;
  readonly file: string;
  /** Where the refusal is, for the report: an offset in the original text. */
  readonly at: number;
  readonly edits: readonly Edit[];
}

/** Applies the edits of some fixes to a text. Edits are applied from the end, so that offsets stay those of the original. */
export function applyEdits(text: string, fixes: readonly Fix[]): string {
  const edits = fixes
    .flatMap((fix) => fix.edits)
    // At the same place, the edit that was asked for last goes first: an opening wraps what follows it.
    .map((edit, order) => ({ edit, order }))
    .toSorted((a, b) => b.edit.start - a.edit.start || b.edit.end - a.edit.end || b.order - a.order);
  return edits.reduce((current, { edit }) => current.slice(0, edit.start) + edit.text + current.slice(edit.end), text);
}

/**
 * Keeps the largest set of fixes it can find under which `holds` stays true, by halving what fails: a fix that
 * breaks the build alone is dropped, and the others are kept.
 */
export function keepWhatHolds(fixes: readonly Fix[], holds: (kept: readonly Fix[]) => boolean): readonly Fix[] {
  const narrow = (kept: readonly Fix[], candidates: readonly Fix[]): readonly Fix[] => {
    if (candidates.length === 0) return kept;
    if (holds([...kept, ...candidates])) return [...kept, ...candidates];
    if (candidates.length === 1) return kept;
    const middle = Math.ceil(candidates.length / 2);
    return narrow(narrow(kept, candidates.slice(0, middle)), candidates.slice(middle));
  };
  return narrow([], fixes);
}
