// A key that is one of two names, and a value that fits one of them: written to the other.
import type { Mut } from '@strict-ts/std';
type Row = { readonly id: number; readonly label: string };
const put = <K extends keyof Row>(row: Mut<Row>, key: K, value: Row[K]): void => {
  row[key] = value;
};
const row: Mut<Row> = { id: 1, label: 'a' };
const key = row.id > 0 ? 'id' : 'label';
put(row, key, 'oops');
if (typeof row.id !== 'number') console.log('BROKEN b09: row.id is typed number and is', typeof row.id);
