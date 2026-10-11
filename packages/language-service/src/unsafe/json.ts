// unsafe/: JSON.parse throws on what is not JSON and returns `any`. It leaves here as a Result of unknown.
import { attempt, type Result } from '@strict-ts/std';

export const parseJson = (text: string, path: string): Result<unknown, string> =>
  attempt(
    (): unknown => JSON.parse(text),
    (cause) => `${path}: ${cause instanceof Error ? cause.message : String(cause)}`,
  );
