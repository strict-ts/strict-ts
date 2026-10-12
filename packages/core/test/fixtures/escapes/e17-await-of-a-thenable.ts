// A value with a `then` that fails: `await` calls it.
// oxlint-disable-next-line unicorn/no-thenable -- the attack
const thenable = { then: (_ok: (value: number) => void, fail: (reason: Error) => void): void => { fail(new Error('no')); } };
export const value: number = await thenable;
