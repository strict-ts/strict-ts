import { end, err, ok, type Mut, type Once, type Result } from '@strict-ts/std';

export class Transaction {
  private readonly entries: Mut<string[]> = [];

  write(this: Mut<Transaction>, entry: string): void {
    this.entries.push(entry);
  }
  written(): readonly string[] {
    return this.entries;
  }
}

export const begin = (): Once<Mut<Transaction>> => new Transaction();
export const commit = (tx: Once<Transaction>): readonly string[] => end(tx).written();
export const rollback = (tx: Once<Transaction>): void => {
  end(tx);
};

export function transfer(from: string, to: string, cents: number): Result<readonly string[], 'nothing-to-move'> {
  const tx = begin();
  tx.write(`${from} -${cents}`);
  if (cents <= 0) {
    rollback(tx);
    return err('nothing-to-move');
  }
  tx.write(`${to} +${cents}`);
  return ok(commit(tx));
}
