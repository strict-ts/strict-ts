/** JSON without exceptions: `JSON.parse` throws on text that is not JSON, `JSON.stringify` on a cycle or a BigInt. */
import { attempt, type Result } from './result.js';

const reason = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

/** Parses JSON text. The value is `unknown`: prove its shape with a schema. */
export const parseJson = (text: string): Result<unknown, string> => attempt((): unknown => JSON.parse(text), reason);

/** Writes a value as JSON text; `undefined`, which JSON cannot hold, is written `null`. */
export const toJson = (value: unknown, indent?: number): Result<string, string> =>
  attempt(() => JSON.stringify(value, undefined, indent) ?? 'null', reason);
