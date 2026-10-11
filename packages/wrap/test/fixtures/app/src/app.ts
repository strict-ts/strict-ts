// Safe code that uses the generated wrapper: every failure of the library is a value here.
import { find, format, load, parse, RETRIES } from "./unsafe/legacy.js";

export const nameOf = (id: string): string =>
  find(id).match({ ok: (found) => found.map((item) => item.name).unwrapOr("nobody"), err: (e) => e.message });

export const size = (text: string): number =>
  parse(text).match({ ok: (value) => (typeof value === "string" ? value.length : RETRIES), err: () => 0 });

export const title = async (url: string): Promise<string> => (await load(url)).unwrapOr(format(new Date(0), "yyyy").unwrapOr(""));
