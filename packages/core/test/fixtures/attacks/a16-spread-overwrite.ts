// A spread writes over a property with one its type does not mention.
type Entry = { readonly id: number };
const extra = { id: 'x', other: 1 };
const partial: { readonly other: number } = extra;
const entry: Entry = { id: 1, ...partial };
if (typeof entry.id !== 'number') console.log('BROKEN a16: entry.id is typed number and is', typeof entry.id);
export {};
