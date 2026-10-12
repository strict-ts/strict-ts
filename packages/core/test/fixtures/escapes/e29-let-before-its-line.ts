// A `let` at the top of a file, read through a function before its line has run.
const read = (): number => later;
export const early = read();
let later = 1;
later += 1;
