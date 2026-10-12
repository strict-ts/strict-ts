// A promise dropped on purpose with `void`, which fails later: the program stops, with no one told.
const failing = (): Promise<number> => new Promise<number>((_resolve, reject) => { reject(new Error('no')); });
void failing();
export {};
