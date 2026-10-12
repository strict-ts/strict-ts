// A local with no written type is mutable, and a read-only view of it changes under its holder.
const list = [1, 2];
const view: readonly number[] = list;
const before = view.length;
list.push(3);
if (view.length !== before) console.log('BROKEN m12: view is typed readonly and went from', before, 'to', view.length);
export {};
