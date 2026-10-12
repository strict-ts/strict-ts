// An object with a length and no element is taken for an array of elements.
const made: readonly number[] = Array.from<number>({ length: 2 });
for (const value of made) if (typeof value !== 'number') console.log('BROKEN c03: value is typed number and is', typeof value);
export {};
