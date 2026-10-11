import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run as gate } from '@strict-ts/cli';
import { afterEach, describe, expect, test } from 'vitest';
import { run, wrapModule } from '../src/index.js';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const fixture = fileURLToPath(new URL('fixtures/app/', import.meta.url));
const copies: string[] = [];

/** A copy of the fixture project that resolves @strict-ts/std and the types of Node from this repo. */
function project(): string {
  const directory = mkdtempSync(join(tmpdir(), 'strict-ts-wrap-'));
  copies.push(directory);
  cpSync(fixture, directory, { recursive: true });
  const tsconfig = JSON.parse(readFileSync(join(directory, 'tsconfig.json'), 'utf8'));
  tsconfig.compilerOptions.paths['@strict-ts/std'] = [join(repo, 'packages/std/src/index.ts')];
  tsconfig.compilerOptions.typeRoots = [join(repo, 'node_modules/@types')];
  tsconfig.compilerOptions.types = ['node'];
  writeFileSync(join(directory, 'tsconfig.json'), JSON.stringify(tsconfig));
  return directory;
}
afterEach(() => {
  for (const directory of copies.splice(0)) rmSync(directory, { recursive: true, force: true });
});

const cli = (cwd: string, ...argv: readonly string[]) => {
  const out: string[] = [];
  const err: string[] = [];
  const code = run(argv, { cwd, out: (line) => out.push(line), err: (line) => err.push(line) });
  return { code, out, err };
};
const check = (cwd: string) => {
  const out: string[] = [];
  const code = gate([], { cwd, out: (line) => out.push(line), err: (line) => out.push(line) });
  return { code, out };
};
const line = (text: string, name: string): string | undefined =>
  text.split('\n').find((candidate) => candidate.startsWith(`export const ${name} =`));

describe('the wrapper of a library', () => {
  const generated = () => {
    const wrapper = wrapModule(project(), undefined, 'legacy');
    if (!wrapper.ok) throw new Error(wrapper.error);
    return wrapper.value;
  };

  test('wraps every function in attempt: an exception becomes an Err', () => {
    const { text, wrapped } = generated();
    expect(wrapped).toEqual(['RETRIES', 'VERSION', 'find', 'first', 'format', 'load', 'loadJson', 'lookup', 'parse', 'stop']);
    expect(line(text, 'load')).toBe("export const load = (...args: Parameters<typeof lib.load>) => attempt(() => lib.load(...args), threw('load'));");
    expect(line(text, 'stop')).toBe("export const stop = (...args: Parameters<typeof lib.stop>) => attempt(() => lib.stop(...args), threw('stop'));");
  });

  test('turns any into unknown, in a promise too', () => {
    const { text } = generated();
    expect(line(text, 'parse')).toContain('attempt((): unknown => lib.parse(...args)');
    expect(line(text, 'loadJson')).toContain('attempt(async (): Promise<unknown> => lib.loadJson(...args)');
  });

  test('turns a result that may be null or undefined into an Option, in a promise too', () => {
    const { text } = generated();
    expect(line(text, 'find')).toMatch(/threw\('find'\)\)\.map\(present\);$/);
    expect(line(text, 'lookup')).toMatch(/threw\('lookup'\)\)\.then\(\(result\) => result\.map\(present\)\);$/);
    expect(text).toContain('const present = <T>(value: T) => Option.from(value ?? undefined);');
  });

  test('re-exports constants, and says what it lost or left out', () => {
    const { text, skipped } = generated();
    expect(line(text, 'RETRIES')).toBe('export const RETRIES = lib.RETRIES;');
    expect(text).toContain('// 2 overloads: only the last one is wrapped\nexport const format =');
    expect(text).toContain('// generic: its type parameters are lost\nexport const first =');
    expect(skipped).toEqual([
      'Client: a class; its constructor and methods are not wrapped',
      'default: not a name a wrapper can take',
      'settings: an object; its methods are not wrapped',
    ]);
    for (const entry of skipped) expect(text).toContain(`//   ${entry}`);
  });

  test('generates the same text twice', () => {
    expect(generated().text).toBe(generated().text);
  });

  test('the generated file passes the gate, and so does the safe code that uses it', () => {
    const directory = project();
    expect(cli(directory, 'legacy', '-o', 'src/unsafe/legacy.ts')).toEqual({
      code: 0,
      out: [],
      err: ['src/unsafe/legacy.ts: 10 wrapped, 3 not wrapped'],
    });
    expect(check(directory)).toEqual({ code: 0, out: [] });
  });

  test('without the wrapper, the same safe code is refused for importing the library', () => {
    const directory = project();
    writeFileSync(join(directory, 'src/direct.ts'), 'import { parse } from "legacy";\nexport const value: unknown = parse("1");\n');
    cli(directory, 'legacy', '-o', 'src/unsafe/legacy.ts');
    expect(check(directory).out.filter((entry) => entry.startsWith('src/'))).toEqual([
      'src/direct.ts:1:23 no-external-import External import "legacy" forbidden outside unsafe/.',
      'src/direct.ts:2:31 no-any This expression has type `any` (inferred).',
      'src/direct.ts:2:31 no-throwing-call `parse` is declared in a declaration file, whose types do not say whether it throws.',
    ]);
  });
});

describe('two real libraries the pilot uses', () => {
  test.each(['node:path', 'node:fs'])('the wrapper of %s passes the gate', (module) => {
    const directory = project();
    rmSync(join(directory, 'src/app.ts'));
    const name = module.replace('node:', '');
    expect(cli(directory, module, '-o', `src/unsafe/${name}.ts`).code).toBe(0);
    expect(check(directory)).toEqual({ code: 0, out: [] });
    const text = readFileSync(join(directory, `src/unsafe/${name}.ts`), 'utf8');
    expect(text.split('\n').filter((entry) => entry.startsWith('export const ')).length).toBeGreaterThan(10);
  });
});

describe('the command line', () => {
  test('prints the wrapper when no file is given', () => {
    const { code, out, err } = cli(project(), 'legacy');
    expect(code).toBe(0);
    expect(err).toEqual([]);
    expect(out.join('\n')).toMatch(/^\/\/ Generated by @strict-ts\/wrap from the declarations of "legacy"\./);
  });

  test('says what it cannot do, with exit code 2', () => {
    const directory = project();
    expect(cli(directory, 'nowhere').err.join('\n')).toMatch(/^strict-ts-wrap: cannot resolve "nowhere" from /);
    expect(cli(directory).err[0]).toBe('strict-ts-wrap: which module?\n\n' + cli(directory, '--help').out.join('\n'));
    expect(cli(directory, 'legacy', '--force').code).toBe(2);
    expect(cli(directory, 'legacy', 'other').err[0]).toMatch(/one module at a time: legacy, then other/);
    expect(cli(directory, 'legacy', '-p', 'missing').err.join('\n')).toMatch(/missing does not exist$/);
  });
});
