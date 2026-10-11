// "Classic" TypeScript: nothing in a signature says what a function changes.
export interface Item {
  name: string;
  cents: number;
  quantity: number;
}

export interface Cart {
  items: Item[];
  coupon?: string;
}

let lastCart: Cart = { items: [] };

// Changes the cart it is given, and remembers it for everyone.
export function add(cart: Cart, item: Item): Cart {
  cart.items.push(item);
  lastCart = cart;
  return cart;
}

// Sorts the caller's array in place: the caller's own order is gone.
export function cheapestFirst(items: Item[]): Item[] {
  return items.sort((a, b) => a.cents - b.cents);
}

// Reads the clock: the same call gives another answer tomorrow.
export function total(cart: Cart): number {
  const sum = cart.items.reduce((cents, item) => cents + item.cents * item.quantity, 0);
  return new Date().getDay() === 5 ? sum * 0.9 : sum;
}

export function applyCoupon(cart: Cart, coupon: string): void {
  cart.coupon = coupon;
  for (const item of cart.items) item.cents = Math.round(item.cents * 0.95);
}

export const previous = (): Cart => lastCart;
