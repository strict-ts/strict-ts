// A spread brings a property its type does not mention into a type where that property is optional.
type Options = { readonly retries?: number; readonly name: string };
const extra = { name: 'job', retries: 'many' };
const named: { readonly name: string } = extra;
const options: Options = { ...named };
if (options.retries !== undefined && typeof options.retries !== 'number') console.log('BROKEN b01: retries is typed number and is', typeof options.retries);
export {};
