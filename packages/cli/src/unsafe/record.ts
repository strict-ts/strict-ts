// unsafe/: the one cast the CLI needs to read JSON it did not write.
import { none, type Option, some } from '@strict-ts/std';

// SAFETY: a non-null object that is not an array has string keys, and its values are read as unknown.
export const asRecord = (value: unknown): Option<Readonly<Record<string, unknown>>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? some(value as Readonly<Record<string, unknown>>) : none;
