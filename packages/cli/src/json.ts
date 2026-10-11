import { panic, toJson } from '@strict-ts/std';

/**
 * Writes one of the CLI's own values as JSON: diagnostics, a baseline, a schema. They are plain data, so a failure
 * here is a bug of the CLI, not an error to hand to the caller.
 */
export const json = (value: unknown, indent?: number): string => toJson(value, indent).match({ ok: (text) => text, err: panic });
