// What made a value changes it while someone else holds it as read-only. Outside guarantee 4: it is aliasing,
// which Rust refuses with its borrow checker and strict-ts leaves to guarantee 5.
const list = [1, 2];
const view: readonly number[] = list;
const before = view.length;
list.push(3);
if (view.length !== before) console.log('BROKEN m12: view is typed readonly and went from', before, 'to', view.length);
export {};
