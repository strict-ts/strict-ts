// An async function that fails with no `throw`: it awaits what fails.
const failing = (): Promise<number> => new Promise<number>((_resolve, reject) => { reject(new Error('no')); });
export const twice = async (): Promise<number> => (await failing()) * 2;
export const value = await twice();
