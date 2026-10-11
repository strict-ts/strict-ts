// unsafe/: what the page is handed from outside its own code, and JSON it did not write.
import { attempt, Option, type Result } from '@strict-ts/std';
import type ts from '@typescript/typescript6';
import type { Data } from '../data.js';

// SAFETY: scripts/build.mjs defines DATA in the bundle's banner, from the JSON it builds with scripts/data.mjs.
declare const DATA: Data | undefined;
// SAFETY: the same banner defines COMPILER as the global `ts` of typescript.js, or undefined when it did not load.
declare const COMPILER: typeof ts | undefined;

export const pageData = (): Option<Data> => Option.from(DATA);
export const compiler = (): Option<typeof ts> => Option.from(COMPILER);

export const parseJson = (text: string): Result<unknown, string> => attempt((): unknown => JSON.parse(text), String);
