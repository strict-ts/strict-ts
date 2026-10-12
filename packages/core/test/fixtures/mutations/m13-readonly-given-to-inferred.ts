// A function whose parameter type is inferred from a default value takes a value typed read-only and changes it.
const frozen: { readonly count: number } = { count: 0 };
const bump = (given = { count: 0 }): number => (given.count += 1);
bump(frozen);
if (frozen.count !== 0) console.log('BROKEN m13: count is typed readonly and is', frozen.count);
export {};
