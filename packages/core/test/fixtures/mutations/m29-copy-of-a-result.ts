// A new container of what a call gave back: what it holds is still the callee's.
const held = [{ count: 0 }];
const current = (): typeof held => held;
function bump(): void {
  const copy = [...current()];
  for (const one of copy) one.count += 1;
}
bump();
if (held[0]?.count !== 0) console.log('BROKEN m29: current does not say Mut and count is', held[0]?.count);
export {};
