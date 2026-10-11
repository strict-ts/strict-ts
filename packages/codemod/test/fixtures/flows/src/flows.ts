// Shapes met in real code, where the fix at fault is not where the compiler reports the error.

// Written to through a key that is one of two names: both stay as they are, the third is fixed.
export interface Loadout {
  weapon: string;
  armor: string;
  label: string;
}
export type Slot = "weapon" | "armor";
export function equip(loadout: Loadout, slot: Slot, id: string): void {
  loadout[slot] = id;
}

// An alias: the map is filled far from where it is written, the lists in it are only read.
export type Store = Map<string, number[]>;
export function put(store: Store, key: string): void {
  store.set(key, []);
}

// No written type on the way: `all` is whatever `names` returns, and it is sorted in place.
export function names(): string[] {
  return ["b", "a"];
}
export function sorted(): string[] {
  const all = names();
  all.sort();
  return all;
}

// A type written in an expression.
export const queue = { items: [] as number[] };
export function enqueue(value: number): void {
  queue.items.push(value);
}

// A member read through `Data['rows']`.
export type Data = { rows: Array<string>; total: number };
export function load(): Data["rows"] {
  const rows: Data["rows"] = [];
  rows.push("first");
  return rows;
}

// One fix fails because another one does: `made` goes where `target` is written to.
export function fill(target: number[]): void {
  target.push(1);
}
export function make(): number[] {
  const made: number[] = [];
  fill(made);
  return made;
}

// A predicate with an object type in it: when the predicate goes, the fixes inside it have nothing left to fix.
export const boxes = (values: unknown[]): unknown[] => values.filter((value): value is { size: number } => typeof value === "object");

// Written to through a key that is read from another object: the record is at fault, not the key.
export type Tally = { counts: Record<Slot, number> };
export function count(tally: Tally, seen: { slot: Slot }[]): void {
  for (const one of seen) tally.counts[one.slot] += 1;
}

// A fix that compiles and weakens typing: `Array.isArray` on a read-only array gives `any[]`.
export function firstOf(value: string | string[]): string {
  return Array.isArray(value) ? (value[0] ?? "") : value;
}
