// The functions of the JavaScript standard library, and of the platform, that throw or reject on arguments their
// types accept. `Owner.member` as the compiler's libraries declare them; the text says what happens.
//
// This table is what the rule knows of the standard library: a function that is not in it is taken not to throw.
// It errs on the side of the common cases, and it is not complete.

/** Throws whatever its arguments. */
export const THROWING: Readonly<Record<string, string>> = {
  'JSON.parse': 'throws a SyntaxError on text that is not JSON',
  'JSON.stringify': 'throws a TypeError on a cycle or a BigInt',
  decodeURI: 'throws a URIError on a malformed sequence',
  decodeURIComponent: 'throws a URIError on a malformed sequence',
  encodeURI: 'throws a URIError on a lone surrogate',
  encodeURIComponent: 'throws a URIError on a lone surrogate',
  'BigIntConstructor.': 'throws on a number that is not whole or a string that is not a number',
  'RegExpConstructor.new': 'throws a SyntaxError on an invalid pattern',
  'RegExpConstructor.': 'throws a SyntaxError on an invalid pattern',
  'URL.new': 'throws a TypeError on an invalid address',
  'String.repeat': 'throws a RangeError on a negative or infinite count',
  'String.normalize': 'throws a RangeError on an unknown form',
  'StringConstructor.fromCodePoint': 'throws a RangeError on an invalid code point',
  'Number.toFixed': 'throws a RangeError on digits out of range',
  'Number.toPrecision': 'throws a RangeError on a precision out of range',
  'Number.toExponential': 'throws a RangeError on digits out of range',
  'Date.toISOString': 'throws a RangeError on an invalid date',
  'Array.with': 'throws a RangeError on an index out of range',
  'ReadonlyArray.with': 'throws a RangeError on an index out of range',
  'ArrayConstructor.new': 'throws a RangeError on a negative length',
  'ArrayConstructor.': 'throws a RangeError on a negative length',
  structuredClone: 'throws a DataCloneError on what cannot be cloned',
  atob: 'throws on text that is not base64',
  btoa: 'throws on a character outside Latin-1',
  eval: 'runs text as code',
  'FunctionConstructor.new': 'runs text as code',
  'PromiseConstructor.reject': 'makes a rejected promise: an exception by another name',
  fetch: 'rejects when the network fails',
  'Body.json': 'rejects on a body that is not JSON',
  'Body.text': 'rejects when the body cannot be read',
  'Body.arrayBuffer': 'rejects when the body cannot be read',
  'Body.blob': 'rejects when the body cannot be read',
  'Body.formData': 'rejects when the body cannot be read',
};

/** Throws only when called with fewer arguments than this: `reduce` without a starting value, on an empty array. */
export const THROWING_BELOW: Readonly<Record<string, readonly [count: number, why: string]>> = {
  'Array.reduce': [2, 'throws a TypeError on an empty array when given no starting value'],
  'Array.reduceRight': [2, 'throws a TypeError on an empty array when given no starting value'],
  'ReadonlyArray.reduce': [2, 'throws a TypeError on an empty array when given no starting value'],
  'ReadonlyArray.reduceRight': [2, 'throws a TypeError on an empty array when given no starting value'],
};
