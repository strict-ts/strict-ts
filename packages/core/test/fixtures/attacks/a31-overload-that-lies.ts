// An overload promises a type its implementation does not return.
function parse(text: string): string;
function parse(count: number): number;
function parse(given: number | string): number | string {
  return typeof given === 'number' ? given : 1;
}
const text: string = parse('a');
if (typeof text !== 'string') console.log('BROKEN a31: text is typed string and is', typeof text, typeof parse(1));
export {};
