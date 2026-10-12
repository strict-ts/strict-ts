// A function cannot be cloned.
const fn = (): number => 1;
export const copy = structuredClone({ fn });
