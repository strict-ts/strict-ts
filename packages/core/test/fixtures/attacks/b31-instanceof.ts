// A value that has the shape of a class and is not made by it: `instanceof` says no, and the types conclude.
class Tag {
  readonly label = 'tag';
}
const sizeOf = (either: Tag | string): number => (either instanceof Tag ? 0 : either.length);
const lookalike: Tag = { label: 'tag' };
const size = sizeOf(lookalike);
if (typeof size !== 'number') console.log('BROKEN b31: size is typed number and is', typeof size);
export {};
