// A getter that answers differently each time, narrowed as a property would be.
let asked = 0;
const source = {
  get value(): string | undefined {
    asked += 1;
    return asked % 2 === 1 ? 'x' : undefined;
  },
};
if (source.value !== undefined) {
  const text: string = source.value;
  if (typeof text !== 'string') console.log('BROKEN b21: text is typed string and is', typeof text);
}
export {};
