// A promise made to fail, with no `throw` written: the callback of the constructor is handed `reject`.
const failing = (): Promise<number> => new Promise<number>((_resolve, reject) => { reject(new Error('no')); });
export const value: number = await failing();
