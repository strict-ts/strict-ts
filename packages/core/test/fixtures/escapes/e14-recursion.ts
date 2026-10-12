// A function that calls itself without end: RangeError, as a stack that overflows.
const down = (n: number): number => down(n + 1) + 1;
export const depth = down(0);
