// A write straight into what a call gave back, with no name for it.
const held = { count: 0 };
const current = (): typeof held => held;
const reader = (view: { readonly count: number }): (() => number) => () => view.count;
const read = reader(held);
function bump(): void {
  current().count += 1;
}
bump();
if (read() !== 0) console.log('BROKEN m27: current does not say Mut and count is', read());
export {};
