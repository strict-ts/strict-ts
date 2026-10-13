import type { Diagnostic } from '@strict-ts/core';
import { mut, type Mut, record } from '@strict-ts/std';
import { asRecord } from './unsafe/record.js';

/** What decides the result of a run, as the project loader reads it. */
export interface Facts {
  /**
   * One hash for everything that is not a checked file and still decides the result: the versions, the compiler
   * options, the configuration, the dependencies and declaration files, and the checked files that declare globals.
   */
  readonly environment: string;
  /** The key of each checked file, by the path shown in diagnostics: see `fileKeys`. */
  readonly keys: Readonly<Record<string, string>>;
}

/** A checked file: the hash of its text and the checked files it imports. */
export interface FileFacts {
  readonly hash: string;
  readonly imports: readonly string[];
}

/** What a run leaves for the next one. */
export interface Cache {
  readonly version: 1;
  readonly environment: string;
  readonly files: Readonly<Record<string, { readonly key: string; readonly diagnostics: readonly Diagnostic[] }>>;
}

/**
 * The key of each file: a hash of its own text and of the text of everything it imports, directly or not. A file's
 * diagnostics depend on its types, and its types on what it imports: when none of those changed, neither did they.
 */
export function fileKeys(files: Readonly<Record<string, FileFacts>>, hash: (text: string) => string): Readonly<Record<string, string>> {
  /** Everything `name` reaches through imports, itself included. Each file is visited once per starting point. */
  const closure = (name: string): readonly string[] => {
    const reached: Mut<Set<string>> = mut(new Set([name]));
    const pending: Mut<string[]> = mut([name]);
    for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
      for (const imported of files[next]?.imports ?? []) {
        if (reached.has(imported)) continue;
        reached.add(imported);
        pending.push(imported);
      }
    }
    return [...reached].toSorted();
  };
  return record(
    Object.keys(files).map((name) => [name, hash(closure(name).map((file) => `${file}:${files[file]?.hash ?? ''}`).join('\n'))] as const),
  );
}

/** The files whose cached result still holds, with that result. An environment that changed spares none. */
export function stillValid(cache: Cache | undefined, facts: Facts): ReadonlyMap<string, readonly Diagnostic[]> {
  if (cache === undefined || cache.environment !== facts.environment) return new Map();
  return new Map(
    Object.entries(cache.files).flatMap(([name, entry]) => (facts.keys[name] === entry.key ? [[name, entry.diagnostics] as const] : [])),
  );
}

/** Reads a cache file. One that is not understood is no cache: everything is checked again. */
export function parseCache(content: unknown): Cache | undefined {
  const root = asRecord(content);
  if (!root.some || root.value['version'] !== 1 || typeof root.value['environment'] !== 'string') return undefined;
  const files = asRecord(root.value['files']);
  if (!files.some) return undefined;
  const entries = Object.entries(files.value).map(([name, value]) => {
    const entry = asRecord(value);
    const key = entry.some ? entry.value['key'] : undefined;
    const diagnostics = entry.some ? entry.value['diagnostics'] : undefined;
    return typeof key === 'string' && Array.isArray(diagnostics) ? ([name, { key, diagnostics: diagnostics.flatMap(asDiagnostic) }] as const) : undefined;
  });
  if (entries.includes(undefined)) return undefined;
  return { version: 1, environment: root.value['environment'], files: record(entries.flatMap((entry) => (entry === undefined ? [] : [entry]))) };
}

const asPosition = (value: unknown): readonly Diagnostic['start'][] => {
  const position = asRecord(value);
  if (!position.some) return [];
  const { line, column } = position.value;
  return typeof line === 'number' && typeof column === 'number' ? [{ line, column }] : [];
};

/** A cached diagnostic, proven field by field; one that is not whole is dropped, and its file checked again. */
function asDiagnostic(value: unknown): readonly Diagnostic[] {
  const record = asRecord(value);
  if (!record.some) return [];
  const { rule, file, message, help } = record.value;
  const [start] = asPosition(record.value['start']);
  const [end] = asPosition(record.value['end']);
  if (typeof rule !== 'string' || typeof file !== 'string' || typeof message !== 'string' || start === undefined || end === undefined) return [];
  const base = { rule, file, start, end, message };
  return [typeof help === 'string' ? { ...base, help } : base];
}
