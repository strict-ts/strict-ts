// A property of the library whose getter throws in strict code.
const f = (): number => 1;
export const who = f.caller;
