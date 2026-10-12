// The other way to hold `reject`.
const { promise, reject } = Promise.withResolvers<number>();
reject(new Error('no'));
export const value: number = await promise;
