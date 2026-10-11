/**
 * Asks for mutation, in the manner of Rust's `&mut`: a parameter typed `Mut<T>` may be changed by the function that
 * receives it, and the caller reads that in the signature. It is `T` itself: the marker is for the reader and for
 * the rules, not for the compiler.
 */
export type Mut<T> = T;
