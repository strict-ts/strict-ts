/** What the web platform throws or rejects with, and its types do not say: here it is a Result. */
import { parseJson } from './json.js';
import { attempt, type Result } from './result.js';
import { textOf } from './text.js';

/**
 * The JSON a request or an answer carries: `bodyJson(request)`, `bodyJson(await fetch(url))`. Its own `json()`
 * gives `any` and rejects on text that is not JSON. The value is `unknown`: prove its shape with a schema.
 */
export async function bodyJson(source: { readonly text: () => Promise<string> }): Promise<Result<unknown, string>> {
  const text = await attempt(() => source.text(), textOf);
  return text.ok ? parseJson(text.value) : text;
}

/** A text as a part of a URL. `encodeURIComponent` throws on half of a surrogate pair. */
export const uriComponent = (text: string): Result<string, string> => attempt(() => encodeURIComponent(text), textOf);

/** A part of a URL as the text it stands for. `decodeURIComponent` throws on a sequence that is not one. */
export const fromUriComponent = (text: string): Result<string, string> => attempt(() => decodeURIComponent(text), textOf);
