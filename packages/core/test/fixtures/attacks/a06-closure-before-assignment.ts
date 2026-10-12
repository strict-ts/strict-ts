// A variable declared without a value is read through a function before it is assigned.
let ready: string;
const peek = (): string => typeof ready;
const early = peek();
ready = 'yes';
if (early === 'undefined') console.log('BROKEN a06: ready is typed string and was undefined', ready.length);
export {};
