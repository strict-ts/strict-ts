// One overload turns unknown into any type: a cast with no `as`.
function coerce<T>(value: unknown): T;
function coerce(value: unknown): unknown {
  return value;
}
const count: number = coerce<number>('seven');
if (typeof count !== 'number') console.log('BROKEN a32: count is typed number and is', typeof count);
export {};
