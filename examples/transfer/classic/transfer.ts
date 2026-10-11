// "Classic" TypeScript: a transaction is a value like any other, and nothing says it must be ended, once.
export class Transaction {
  private open = true;
  private readonly entries: string[] = [];

  debit(account: string, cents: number): void {
    this.entries.push(`${account} -${cents}`);
  }
  credit(account: string, cents: number): void {
    this.entries.push(`${account} +${cents}`);
  }
  commit(): string[] {
    if (!this.open) throw new Error("already ended");
    this.open = false;
    return this.entries;
  }
  rollback(): void {
    if (!this.open) throw new Error("already ended");
    this.open = false;
  }
}

const audit: Transaction[] = [];

export function transfer(from: string, to: string, cents: number): string[] {
  const tx = new Transaction();
  tx.debit(from, cents);
  // Left open: this path neither commits nor rolls back.
  if (cents <= 0) return [];
  tx.credit(to, cents);
  // A second owner: whoever reads `audit` can end it too.
  audit.push(tx);
  const written = tx.commit();
  // Used after it was ended: throws at run time.
  tx.rollback();
  return written;
}
