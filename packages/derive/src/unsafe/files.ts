// unsafe/: the file system and the parser. Everything that may throw leaves here as a Result.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { attempt, err, ok, type Result, textOf } from '@strict-ts/std';
import ts from '@typescript/typescript6';
import { deriveSchemas, type Derived } from '../generate.js';

export interface Target {
  /** The generated module, as text. */
  readonly derived: Derived;
  /** Where it goes: beside the file, `invoice.schema.ts` for `invoice.ts`, unless another place was asked for. */
  readonly output: string;
}

/** Reads a source file and generates the schemas of its types. An error is one line, or one for each type that cannot be followed. */
export function deriveFile(cwd: string, file: string, names: readonly string[], output: string | undefined): Result<Target, string> {
  const derived = attempt((): Result<Target, string> => {
    const source = resolve(cwd, file);
    if (!existsSync(source)) return err(`${source} does not exist`);
    const target = output === undefined ? source.replace(/\.tsx?$/, '.schema.ts') : resolve(cwd, output);
    const path = relative(dirname(target), source).replaceAll('\\', '/').replace(/\.tsx?$/, '.js');
    const sourceFile = ts.createSourceFile(source, readFileSync(source, 'utf8'), ts.ScriptTarget.Latest, true);
    const result = deriveSchemas(ts, sourceFile, path.startsWith('.') ? path : `./${path}`, names);
    if (!result.ok) return err(result.error.map((problem) => `${basename(source)}:${problem.line}:${problem.column} cannot follow ${problem.what}`).join('\n'));
    return ok({ derived: result.value, output: target });
  }, textOf);
  return derived.andThen((result) => result);
}

/** Whether the file on disk is what would be generated. */
export function isCurrent(target: Target): Result<boolean, string> {
  return attempt(() => existsSync(target.output) && readFileSync(target.output, 'utf8') === target.derived.text, textOf);
}

export function writeTarget(target: Target): Result<string, string> {
  return attempt(() => {
    writeFileSync(target.output, target.derived.text);
    return target.output;
  }, textOf);
}
