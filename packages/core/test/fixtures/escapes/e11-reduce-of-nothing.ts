// reduce with no starting value, on an array that may be empty.
const none: readonly number[] = [];
export const sum = none.reduce((a, b) => a + b);
