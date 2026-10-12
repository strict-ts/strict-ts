// What `map` gives holds what the parameter holds, when the function it is given hands each one back.
const cart = { lines: [{ quantity: 1 }] };
function empty(given: typeof cart): void {
  const same = given.lines.map((line) => line);
  for (const line of same) line.quantity = 0;
}
empty(cart);
if (cart.lines[0]?.quantity !== 1) console.log('BROKEN m28: empty takes no Mut and quantity is', cart.lines[0]?.quantity);
export {};
