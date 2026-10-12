import type { Diagnostic } from '@strict-ts/core';
import { json } from './json.js';

/** A line to add under a refusal, in the manner of rustc's `note:`. */
export type Note = (diagnostic: Diagnostic) => string | undefined;

/** One line per refusal, `file:line:column rule message`, its help and note below, and a count at the end. */
export function formatText(found: readonly Diagnostic[], note: Note = () => undefined): readonly string[] {
  if (found.length === 0) return [];
  const lines = found.flatMap((d) => {
    const place = d.file === '' ? '' : `${d.file}:${d.start.line}:${d.start.column} `;
    const noted = note(d);
    return [
      `${place}${d.rule} ${d.message}`,
      ...(d.help === undefined ? [] : [`  help: ${d.help}`]),
      ...(noted === undefined ? [] : [`  note: ${noted}`]),
    ];
  });
  const files = new Set(found.map((d) => d.file)).size;
  return [...lines, '', `${found.length} refused in ${files} ${files === 1 ? 'file' : 'files'}`];
}

/**
 * One JSON document: `{ "diagnostics": [...] }`, the refused diagnostics as core gives them. `extra` adds keys beside
 * them (the baseline's counts, when one is used).
 */
export const formatJson = (found: readonly Diagnostic[], extra: Readonly<Record<string, unknown>> = {}): string =>
  json({ ...extra, diagnostics: found }, 2);
