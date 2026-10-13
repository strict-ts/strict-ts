import type { Span } from './syntax.js';
import { mut } from './mut.js';

/** 1-based; `column` counts UTF-16 code units. A diagnostic without a place in a file has line 0. */
export interface Position {
  readonly line: number;
  readonly column: number;
}

export interface Diagnostic {
  readonly rule: string;
  readonly file: string;
  readonly start: Position;
  readonly end: Position;
  readonly message: string;
  /** What to write instead, in the manner of rustc's `help:`. */
  readonly help?: string;
}

/** Turns offsets in `text` into positions. */
export function locator(text: string): (offset: number) => Position {
  const lineStarts = mut([0]);
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) lineStarts.push(i + 1);
  }
  return (offset) => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if ((lineStarts[middle] ?? 0) <= offset) low = middle;
      else high = middle - 1;
    }
    return { line: low + 1, column: offset - (lineStarts[low] ?? 0) + 1 };
  };
}

export function diagnosticAt(
  rule: string,
  file: string,
  locate: (offset: number) => Position,
  span: Span,
  message: string,
  help?: string,
): Diagnostic {
  const base = { rule, file, start: locate(span.start), end: locate(Math.max(span.end, span.start + 1)), message };
  return help === undefined ? base : { ...base, help };
}

export function compareDiagnostics(a: Diagnostic, b: Diagnostic): number {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  return a.start.line - b.start.line || a.start.column - b.start.column;
}
