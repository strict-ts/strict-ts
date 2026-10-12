// The same transfer, conforming: a transaction has one owner, and is ended exactly once.
import { end, err, ok, type Mut, type Once, type Result } from "@strict-ts/std";

export class Transaction {
  private readonly entries: Mut<string[]> = [];

  debit(this: Mut<Transaction>, account: string, cents: number): void {
    this.entries.push(`${account} -${cents}`);
  }
  credit(this: Mut<Transaction>, account: string, cents: number): void {
    this.entries.push(`${account} +${cents}`);
  }
  written(): readonly string[] {
    return this.entries;
  }
}

/** The one way to get a transaction: it comes with its duty. */
export const begin = (): Once<Mut<Transaction>> => new Transaction();

/** Takes the transaction for good. Nobody can use it after. */
export const commit = (tx: Once<Transaction>): readonly string[] => end(tx).written();
export const rollback = (tx: Once<Transaction>): void => {
  end(tx);
};

export function transfer(from: string, to: string, cents: number): Result<readonly string[], "nothing-to-move"> {
  const tx = begin();
  tx.debit(from, cents);
  if (cents <= 0) {
    // Without this line: « `tx` is not given away before this `return` ».
    rollback(tx);
    return err("nothing-to-move");
  }
  tx.credit(to, cents);
  // After this line, any use of `tx` is refused: « used after it was given away ».
  return ok(commit(tx));
}
