import { mut, type Mut } from '@strict-ts/std';

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
  /** A name of the library the fix writes, to be imported where it is not: `Mut`, `panic`. */
  readonly needs?: 'Mut' | 'panic';
}

/**
 * Applies the edits of some fixes to a text. Edits are applied from the end, so that offsets stay those of the
 * original. An edit inside what another one replaces is dropped: its text is no longer there.
 */
export function applyEdits(text: string, fixes: readonly Fix[]): string {
  const all = fixes.flatMap((fix) => fix.edits);
  const replaced = all.filter((edit) => edit.end > edit.start);
  const edits = all
    .filter((edit) => !replaced.some((over) => over !== edit && over.start <= edit.start && edit.end <= over.end && over.end - over.start > edit.end - edit.start))
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

/** A fix with its place in the text once the fixes of its file are applied. */
export interface Placed {
  readonly fix: Fix;
  readonly at: number;
}

/**
 * Where each fix of one file sits once they are all applied. What an edit inserts at a place does not move that
 * place: a fix is found at the start of what it wrote.
 */
export function placesAfter(fixes: readonly Fix[]): readonly Placed[] {
  const edits = fixes.flatMap((fix) => fix.edits).toSorted((a, b) => a.start - b.start);
  const moved = (at: number): number => {
    let shift = 0;
    for (const edit of edits) {
      if (edit.start >= at) break;
      // Inside what an edit replaces, the place is the start of the replacement.
      if (edit.end > at) return edit.start + shift;
      shift += edit.text.length - (edit.end - edit.start);
    }
    return at + shift;
  };
  return fixes.map((fix) => ({ fix, at: moved(fix.at) }));
}

/** One new error of a compilation: where it is, and the applied fixes it points at. */
export interface Complaint {
  /** The same text for the same error from one compilation to the next. */
  readonly where: string;
  readonly fixes: readonly Fix[];
}

/**
 * What one trial says of a set of fixes: whether the project holds with them, and what is newly wrong when it does
 * not. A trial may stop at the first check that fails; asked to be `thorough`, it runs them all, so that an error
 * of a later check is seen even where an earlier one fails.
 */
export interface Trial {
  readonly holds: boolean;
  readonly errors: readonly Complaint[];
}

/** How many times the errors that point at nothing are asked to spell what causes them, before searching blind. */
const HUNTS = 8;
/** How many times what was refused is tried again on what came back since. */
const PASSES = 6;

/**
 * Keeps the fixes under which the project holds, asking the errors which fixes to drop instead of searching blind:
 * a few compilations, where `keepWhatHolds` needs some for each fix that fails.
 *
 * First everything is applied. A fix that an error then points at alone is dropped for good, and whatever the
 * errors point at is taken out until the project holds. The rest of what was taken out is not known to be at
 * fault: it was named together with others, or it only failed because another fix was out. Those are put back in
 * turns, half of what an error has named together at a time, and each is kept unless an error names it alone;
 * one that came back while another fix was in goes out again if an error names it once that fix is out. This is
 * done again, on what the last turns kept, until nothing more comes back.
 *
 * What `tryWith` blames is only a hint. The result is compiled before it is returned, and wherever the hints fail,
 * `keepWhatHolds` decides.
 */
export function keepUnblamed(fixes: readonly Fix[], tryWith: (kept: readonly Fix[], thorough?: boolean) => Trial): readonly Fix[] {
  const holds = (kept: readonly Fix[]): boolean => tryWith(kept).holds;
  const inOrder = (kept: Iterable<Fix>): readonly Fix[] => {
    const wanted = new Set(kept);
    return fixes.filter((fix) => wanted.has(fix));
  };
  /** What each error of a trial points at, among the fixes that were tried. */
  const pointed = (trial: Trial, tried: ReadonlySet<Fix>): readonly (readonly Fix[])[] =>
    trial.errors.map((error) => [...new Set(error.fixes)].filter((fix) => tried.has(fix))).filter((group) => group.length > 0);
  /** The errors of a trial that point at none of the fixes that were tried. */
  const orphans = (trial: Trial, tried: ReadonlySet<Fix>): readonly string[] =>
    trial.holds ? [] : trial.errors.filter((error) => !error.fixes.some((fix) => tried.has(fix))).map((error) => error.where);
  const alone = (groups: readonly (readonly Fix[])[]): readonly Fix[] => groups.filter((group) => group.length === 1).flat();

  /**
   * What causes errors that point at nothing. Each candidate has a number, and one compilation for each binary
   * digit applies the candidates that have it: an error that one fix causes is there exactly when that fix is,
   * so it spells the number of its fix. All the errors are read in the same compilations.
   */
  const hunt = (base: readonly Fix[], candidates: readonly Fix[], wheres: readonly string[]): readonly Fix[] => {
    const spelled: Mut<Map<string, number>> = mut(new Map());
    for (let digit = 1; digit <= candidates.length; digit *= 2) {
      const trial = tryWith(inOrder([...base, ...candidates.filter((_, index) => Math.floor((index + 1) / digit) % 2 === 1)]), true);
      const present = new Set(trial.errors.map((error) => error.where));
      for (const where of wheres) if (present.has(where)) spelled.set(where, (spelled.get(where) ?? 0) + digit);
    }
    return [...new Set(spelled.values())].flatMap((number) => candidates.slice(number - 1, number));
  };

  // The groups of fixes an error has named together: one of them may answer for the others.
  const order = new Map(fixes.map((fix, index) => [fix, index]));
  const known: Mut<Set<string>> = mut(new Set());
  const together: Mut<(readonly Fix[])[]> = mut([]);
  const remember = (groups: readonly (readonly Fix[])[]): void => {
    for (const group of groups) {
      const key = group.map((fix) => order.get(fix)).join(' ');
      if (group.length > 1 && !known.has(key)) {
        known.add(key);
        together.push(group);
      }
    }
  };

  const dropped: Mut<Set<Fix>> = mut(new Set());
  let floor = fixes;
  for (let first = true, hunts = 0; ; first = false) {
    const trial = tryWith(floor);
    if (trial.holds) break;
    const tried = new Set(floor);
    const groups = pointed(trial, tried);
    const out = new Set(groups.length > 0 ? groups.flat() : hunts++ < HUNTS ? hunt([], floor, orphans(trial, tried)) : []);
    // Errors that point at nothing and spell nothing: the search by halves finds what causes them.
    if (out.size === 0) {
      const kept = new Set(keepWhatHolds(floor, holds));
      for (const fix of floor) if (!kept.has(fix)) dropped.add(fix);
      floor = floor.filter((fix) => kept.has(fix));
      break;
    }
    // Named alone while every other fix was in: nothing else can answer for it.
    if (first) for (const fix of alone(groups)) dropped.add(fix);
    remember(groups);
    floor = floor.filter((fix) => !out.has(fix));
  }

  const back: Mut<Set<Fix>> = mut(new Set(floor));
  const settled = new Set(floor);
  const unsure: Mut<Set<Fix>> = mut(new Set());
  let proven = true;
  for (let before = -1, passes = 0; before < back.size && passes < PASSES; passes++) {
    before = back.size;
    const refused: Mut<Set<Fix>> = mut(new Set());
    // What came back and is not yet proven to hold: an error that names one of these takes it out again.
    const returned = (): readonly Fix[] => [...back].filter((fix) => !settled.has(fix));
    const open = (): readonly Fix[] => fixes.filter((fix) => !dropped.has(fix) && !back.has(fix) && !unsure.has(fix) && !refused.has(fix));
    for (let waiting = open(); waiting.length > 0; waiting = open()) {
      // Half of the smallest group is tried and the rest of it waits, as does any group that shares a fix with
      // it: a large group with one fix at fault is settled in a few turns. A group with a fix already found at
      // fault has its answer, and holds nothing back.
      const still = new Set(waiting);
      const pending = together
        .filter((group) => !group.some((fix) => dropped.has(fix) || refused.has(fix)))
        .map((group) => group.filter((fix) => still.has(fix)))
        .filter((group) => group.length > 1)
        .toSorted((a, b) => a.length - b.length);
      const held: Mut<Set<Fix>> = mut(new Set());
      const tried: Mut<Set<Fix>> = mut(new Set());
      for (const group of pending) {
        if (!group.some((fix) => held.has(fix))) for (const fix of group.slice(0, Math.floor(group.length / 2))) tried.add(fix);
        for (const fix of group) held.add(fix);
      }
      for (const fix of waiting) if (!held.has(fix)) tried.add(fix);
      const trial = tryWith(inOrder([...back, ...tried]));
      const groups = pointed(trial, tried);
      proven = trial.holds;
      remember(groups);
      const named = new Set(groups.flat());
      const unnamed = [...tried].filter((fix) => !named.has(fix));
      // A fix that came back while another was in, and that an error names now that the other is out. An error
      // that also names a fix being tried is that fix's: what came back held without it.
      // Named alone, it is refused; named with others, they all wait again and are tried by halves.
      const earlier = new Set(returned());
      const fallen = trial.holds ? [] : pointed({ holds: false, errors: trial.errors.filter((error) => !error.fixes.some((fix) => tried.has(fix))) }, earlier);
      remember(fallen);
      const lost = orphans(trial, new Set([...tried, ...earlier]));
      const spelled = lost.length === 0 ? [] : hunt(inOrder(back), unnamed, lost);
      for (const fix of [...alone(groups), ...spelled, ...alone(fallen)]) refused.add(fix);
      for (const fix of fallen.flat()) back.delete(fix);
      // Errors that point at none of them and spell nothing: these are left to the search by halves.
      for (const fix of unnamed) if (!refused.has(fix)) (lost.length > 0 && spelled.length === 0 ? unsure : back).add(fix);
    }
    // What came back holds together only once the fixes that needed one that was refused are out too.
    while (!proven) {
      const trial = tryWith(inOrder(back));
      proven = trial.holds;
      const groups = trial.holds ? [] : pointed(trial, new Set(returned()));
      if (groups.length === 0) break;
      // Those an error names together are tried by halves the next time round.
      remember(groups);
      for (const fix of groups.flat()) back.delete(fix);
    }
    if (proven) for (const fix of back) settled.add(fix);
  }
  const sure =
    proven || holds(inOrder(back))
      ? inOrder(back)
      : [...floor, ...keepWhatHolds(inOrder(back).filter((fix) => !floor.includes(fix)), (some) => holds(inOrder([...floor, ...some])))];
  return inOrder([...sure, ...keepWhatHolds(inOrder(unsure), (some) => holds(inOrder([...sure, ...some])))]);
}
