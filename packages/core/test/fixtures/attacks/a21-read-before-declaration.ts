// A constant read through a function before the line that declares it.
const read = (): number => later;
try {
  read();
} catch {
  console.log('BROKEN a21: a read the types accept throws a ReferenceError');
}
const later = 1;
export { later };
