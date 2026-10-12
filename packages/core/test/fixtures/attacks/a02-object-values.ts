// A value with more properties than its type says: Object.values reads them all.
type Prices = { readonly apple: number };
const raw = { apple: 1, note: 'fresh' };
const prices: Prices = raw;
const total = Object.values(prices).reduce((sum, value) => sum + value, 0);
if (typeof total !== 'number') console.log('BROKEN a02: total is typed number and is', typeof total);
export {};
