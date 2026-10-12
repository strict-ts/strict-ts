// The same with Object.assign, on a value typed read-only.
const frozen: { readonly count: number } = { count: 0 };
function poke(given: { readonly count: number }): void {
  try {
    Object.assign(given, { count: 7 });
  } catch {
    // Object.assign throws on a frozen object; this one is not.
  }
}
poke(frozen);
if (frozen.count !== 0) console.log('BROKEN m08: count is typed readonly and is', frozen.count);
export {};
