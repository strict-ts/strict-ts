// A function hands out what it holds, and says nothing of whether it may be written; another writes into it.
const held = { count: 0 };
const current = (): typeof held => held;
const reader = (view: { readonly count: number }): (() => number) => () => view.count;
const read = reader(held);
function bump(): void {
  const now = current();
  now.count += 1;
}
bump();
if (read() !== 0) console.log('BROKEN m25: current does not say Mut and count is', read());
export {};
