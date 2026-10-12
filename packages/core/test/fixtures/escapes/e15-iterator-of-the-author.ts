// An object that says it can be iterated and gives nothing to iterate with.
const broken: Iterable<number> = { [Symbol.iterator]: () => ({ next: () => ({ done: false, value: 1 }) }) };
const odd = { ...broken, [Symbol.iterator]: undefined };
for (const n of odd as unknown as Iterable<number>) console.log(n);
export {};
