// The same with the function of the library.
const failing = (): Promise<number> => Promise.reject(new Error('no'));
export const value: number = await failing();
