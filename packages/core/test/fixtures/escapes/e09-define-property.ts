// Defining again a property that cannot be: TypeError.
const fixed = Object.freeze({ size: 1 });
Object.defineProperty(fixed, 'size', { value: 2 });
export {};
