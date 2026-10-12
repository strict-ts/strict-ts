// What a parameter holds, changed through the variable of a loop.
const cart = { lines: [{ quantity: 1 }] };
function double(given: typeof cart): void {
  for (const line of given.lines) line.quantity *= 2;
}
double(cart);
if (cart.lines[0]?.quantity !== 1) console.log('BROKEN m02: double takes no Mut and quantity is', cart.lines[0]?.quantity);
export {};
