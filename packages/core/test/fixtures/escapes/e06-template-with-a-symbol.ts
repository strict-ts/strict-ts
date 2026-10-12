// A symbol cannot be made a text by a template.
const tag: symbol = Symbol('tag');
export const text = `${String(1)}${tag as unknown as string}`;
