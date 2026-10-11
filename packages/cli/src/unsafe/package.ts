// unsafe/: reading package.json files, to tell which package a declaration file belongs to.
import { attempt, none, type Option, some } from '@strict-ts/std';
import { asRecord } from './record.js';

const known = new Map<string, Option<string>>();

/**
 * The name of the package a file belongs to: the `name` of the nearest package.json above it. `readFile` gives a
 * file's text, or undefined when there is none.
 */
export function packageNameOf(readFile: (path: string) => string | undefined, fileName: string): Option<string> {
  const directory = fileName.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
  const cached = known.get(directory);
  if (cached !== undefined) return cached;
  const text = directory === '' ? undefined : readFile(`${directory}/package.json`);
  const name = text === undefined ? none : attempt((): unknown => JSON.parse(text), String).unwrapOr(undefined);
  const record = name === none ? none : asRecord(name);
  const own = record.some && typeof record.value['name'] === 'string' ? some(record.value['name']) : none;
  // A directory without a name of its own belongs to the package above it.
  const found = own.some || directory === '' || !directory.includes('/') ? own : packageNameOf(readFile, `${directory}.json`);
  known.set(directory, found);
  return found;
}
