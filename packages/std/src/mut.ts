declare const MUT: unique symbol;

/**
 * Something that may be changed, in the manner of Rust's `&mut`. The compiler carries the word: a value typed `T`
 * is not given where `Mut<T>` is asked, by any way there is to give it, and a `Mut<T>` is given where `T` is asked,
 * to be read. The mark is one level: what a `Mut<Cart[]>` holds is a `Cart`, to read, unless the list says
 * `Mut<Mut<Cart>[]>`.
 *
 * Nothing of it exists when the program runs.
 */
export type Mut<T> = T & { readonly [MUT]: true };

/**
 * Says of something just made that it may be changed: `mut({ total: 0 })`, `mut(new Map())`, `mut([...list])`.
 * The rules ask that it be given nothing else: a thing someone else holds is not made changeable by naming it so.
 */
export function mut<T extends object>(fresh: T): Mut<T> {
  // The one place the mark is put on: no value carries it.
  return fresh as Mut<T>;
}
