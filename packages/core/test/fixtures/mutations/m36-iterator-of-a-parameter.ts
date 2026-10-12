// An iterator is changed by reading it: a function that takes one and does not say Mut uses it up.
function first(given: Iterator<number>): number | undefined {
  const step = given.next();
  return step.done === true ? undefined : step.value;
}
const numbers = [1, 2][Symbol.iterator]();
first(numbers);
const after = numbers.next();
if (after.value !== 1) console.log('BROKEN m36: first takes no Mut and the iterator moved to', after.value);
export {};
