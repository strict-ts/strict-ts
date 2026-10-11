/**
 * Asks for mutation, as `Mut<T>` of @strict-ts/std does. core depends on no package, so it has its own: the rules
 * know the marker by its name.
 */
export type Mut<T> = T;
