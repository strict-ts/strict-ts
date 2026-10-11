// unsafe/: reading the events file.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { attempt, type Result } from '@strict-ts/std';
import type { Event } from '../events.js';

const hasSite = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && 'type' in value && 'site' in value && typeof value.site === 'object' && value.site !== null;

/** Reads what the probes wrote: one event a line. A line that is not an event is left out. */
export const readEvents = (cwd: string, file: string): Result<readonly Event[], string> =>
  attempt(
    () =>
      readFileSync(resolve(cwd, file), 'utf8')
        .split('\n')
        .filter((line) => line.trim() !== '')
        .flatMap((line): readonly Event[] => {
          const value: unknown = JSON.parse(line);
          // SAFETY: the lines are written by this package's own runtime, from the Event type; a line that has no site is dropped.
          return hasSite(value) ? [value as Event] : [];
        }),
    (cause) => `${file}: ${cause instanceof Error ? cause.message : String(cause)}`,
  );
