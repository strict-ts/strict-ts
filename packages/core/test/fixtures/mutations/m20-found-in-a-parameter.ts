// What a method of a parameter gives back is a part of it.
const cart = { lines: [{ quantity: 1 }] };
function empty(given: typeof cart): void {
  const found = given.lines.find((line) => line.quantity > 0);
  if (found !== undefined) found.quantity = 0;
}
empty(cart);
if (cart.lines[0]?.quantity !== 1) console.log('BROKEN m20: empty takes no Mut and quantity is', cart.lines[0]?.quantity);
export {};
