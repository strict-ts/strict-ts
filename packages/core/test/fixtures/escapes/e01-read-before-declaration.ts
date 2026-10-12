// A constant read through a function before the line that declares it: ReferenceError.
const read = (): number => later;
export const early = read();
const later = 1;
