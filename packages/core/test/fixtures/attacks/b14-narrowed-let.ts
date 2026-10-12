// A local narrowed by a test, changed by a function that is called before it is used.
let current: string | number = 'a';
const reset = (): void => {
  current = 1;
};
if (typeof current === 'string') {
  reset();
  const text: string = current;
  if (typeof text !== 'string') console.log('BROKEN b14: text is typed string and is', typeof text);
}
export {};
