// What a parameter holds, taken out by a pattern in the body and changed.
const cart = { lines: [1] };
function grow(given: typeof cart): void {
  const { lines } = given;
  lines.push(2);
}
grow(cart);
if (cart.lines.length !== 1) console.log('BROKEN m03: grow takes no Mut and lines has', cart.lines.length);
export {};
