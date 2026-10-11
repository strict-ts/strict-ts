/**
 * A value with one owner, given away exactly once, in the manner of a value Rust moves: a transaction to commit or
 * to roll back, a lock to release, a handle to close. The rule `use-once` refuses losing one, using one after it
 * was given away, and giving one to a function that does not ask for it.
 *
 * It is `T`, with a mark only the rules read: a function makes one by saying so in its return type.
 *
 *     export function begin(): Once<Transaction> { return new Transaction(); }
 *     export function commit(tx: Once<Transaction>): Result<void, DbError> { … }
 */
export type Once<T> = T & { readonly __once?: never };

/**
 * Ends the ownership of a value: the one place a `Once<T>` becomes a plain `T` again. For the function that really
 * finishes the value (the one that commits the transaction, that closes the handle), which has nobody left to give
 * it to.
 */
export function end<T>(value: Once<T>): T {
  return value;
}
