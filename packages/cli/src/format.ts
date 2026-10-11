import type { Diagnostic } from '@strict-ts/core';

/** One line per refusal, `file:line:column rule message`, its help below, and a count at the end. */
export function formatText(found: readonly Diagnostic[]): readonly string[] {
  if (found.length === 0) return [];
  const lines = found.flatMap((d) => {
    const place = d.file === '' ? '' : `${d.file}:${d.start.line}:${d.start.column} `;
    const first = `${place}${d.rule} ${d.message}`;
    return d.help === undefined ? [first] : [first, `  help: ${d.help}`];
  });
  const files = new Set(found.map((d) => d.file)).size;
  return [...lines, '', `${found.length} refused in ${files} ${files === 1 ? 'file' : 'files'}`];
}

/** One JSON document: `{ "diagnostics": [...] }`, the diagnostics as core gives them. */
export const formatJson = (found: readonly Diagnostic[]): string => JSON.stringify({ diagnostics: found }, undefined, 2);
