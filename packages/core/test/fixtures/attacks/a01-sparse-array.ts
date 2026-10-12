// An array made with a length has holes: reading one gives undefined where the type says number.
// oxlint-disable-next-line unicorn/no-new-array -- the holes are the point
const holes = new Array<number>(3);
for (const n of holes) if (typeof n !== 'number') console.log('BROKEN a01: n is typed number and is', typeof n);
export {};
