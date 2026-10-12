// What an unsafe directory can hand to safe code besides a function that returns a Result.
// SAFETY: these are the attack: each one throws.
export const api = { read: (): string => { throw new Error('from an object'); } };
export class Reader {
  read(): string { throw new Error('from a class'); }
}
export const make = (): (() => string) => () => { throw new Error('from a function that is returned'); };
export const lazy = { get value(): string { throw new Error('from a getter'); } };
