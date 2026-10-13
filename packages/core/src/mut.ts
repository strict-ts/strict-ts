declare const MUT: unique symbol;

/**
 * Something that may be changed, as `Mut<T>` of @strict-ts/std is. core depends on no package, so it has its own:
 * the rules know the mark by its name, and the two are told apart by the compiler, which is right, since nothing
 * of the checker is given to the programs it checks.
 */
export type Mut<T> = T & { readonly [MUT]: true };

/** Says of something just made that it may be changed. */
export function mut<T extends object>(fresh: T): Mut<T> {
  // The one place the mark is put on: no value carries it.
  return fresh as Mut<T>;
}
