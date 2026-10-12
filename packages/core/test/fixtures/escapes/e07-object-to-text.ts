// An object whose conversion to text gives no text.
const odd = { toString: (): object => ({}) };
export const text = `${odd}`;
