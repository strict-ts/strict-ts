import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { effectsLedger } from '@strict-ts/core';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { formatReport, hasFailures, openInstrumenter, readEvents, run, strictTsProbe, summarise } from '../src/index.js';

const fixture = fileURLToPath(new URL('fixtures/app/', import.meta.url));
const directory = mkdtempSync(join(tmpdir(), 'strict-ts-probe-'));
const events = join(directory, 'events.jsonl');
afterAll(() => rmSync(directory, { recursive: true, force: true }));

/** Instruments the fixture, writes it as plain modules, and runs a script against them. */
function runInstrumented(script: string): string {
  const instrumenter = openInstrumenter(join(directory, 'project'), undefined, events);
  if (!instrumenter.ok) throw new Error(instrumenter.error);
  for (const file of instrumenter.value.files) {
    const emitted = instrumenter.value.emit(file);
    if (!emitted.ok || !emitted.value.some) throw new Error(`not emitted: ${file}`);
    const out = join(directory, 'out', file.slice(instrumenter.value.rootDir.length + 1).replace(/\.ts$/, '.js'));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, emitted.value.value.code);
  }
  writeFileSync(join(directory, 'out/package.json'), '{ "type": "module" }');
  writeFileSync(join(directory, 'out/driver.mjs'), script);
  return execFileSync(process.execPath, [join(directory, 'out/driver.mjs')], { encoding: 'utf8' });
}

const driver = `
import { joined, label, pad, rates, tags } from './src/pricing.js';
import { firstTag, parseUser } from './src/unsafe/api.js';
const attempt = (run) => { try { return String(run()); } catch (error) { return 'threw ' + error.name; } };
console.log(JSON.stringify({
  label: label(1999, 2),
  tags: tags(' a,b '),
  labelOut: attempt(() => label(1, 200)),
  pad: pad(8).byteLength,
  padOut: attempt(() => pad(-1)),
  joined: attempt(() => joined([Symbol('a')])),
  frozen: attempt(() => rates.push(40)),
  user: parseUser('{"id":"u1","age":3}').value.id,
  wrongUser: parseUser('{"id":7}').value.id,
  notJson: attempt(() => parseUser('{')),
  tag: firstTag('a%20b').value,
  badTag: attempt(() => firstTag('%')),
}));
`;

describe('instrumented code', () => {
  let output: Record<string, unknown>;
  beforeAll(() => {
    cpSync(fixture, join(directory, 'project'), { recursive: true });
    output = JSON.parse(runInstrumented(driver));
  }, 60_000);

  const report = () => {
    const read = readEvents(directory, 'events.jsonl');
    if (!read.ok) throw new Error(read.error);
    // As if a person had judged `join` safe, which the generated ledger knows better than.
    const judged = { ...effectsLedger, 'ReadonlyArray.join': { verdict: 'total', evidence: { byHand: 'judged safe, for this test' } } } as const;
    return summarise(read.value, judged);
  };
  const said = (findings: readonly { site: { file: string; line: number; name: string }; detail: string }[]) =>
    findings.map((finding) => `${finding.site.file}:${finding.site.line} ${finding.site.name}: ${finding.detail}`);

  test('behaves as the code it was made from', () => {
    expect(output).toMatchObject({ label: '19.99', tags: ['a', 'b'], pad: 8, user: 'u1', wrongUser: 7, tag: 'a b' });
    expect(output).toMatchObject({ labelOut: 'threw RangeError', padOut: 'threw RangeError', notJson: 'threw SyntaxError', badTag: 'threw URIError' });
  });

  test('a function the ledger calls safe that throws is a contradiction', () => {
    expect(output['joined']).toBe('threw TypeError');
    expect(said(report().contradictions)).toEqual(['src/pricing.ts:8 ReadonlyArray.join: TypeError: Cannot convert a Symbol value to a string']);
  });

  test('a function that is not in the ledger and throws is an entry to add', () => {
    expect(said(report().unknownThrows)).toEqual(['src/pricing.ts:6 ArrayBufferConstructor.new: RangeError: Invalid array buffer length']);
  });

  test('a function the ledger says throws, and does, confirms the ledger', () => {
    expect(said(report().confirmed)).toEqual([
      'src/pricing.ts:2 Number.toFixed: RangeError: toFixed() digits argument must be between 0 and 100',
      'src/unsafe/api.ts:9 JSON.parse: SyntaxError: Expected property name or \'}\' in JSON at position 1 (line 1 column 2)',
      'src/unsafe/api.ts:14 decodeURIComponent: URIError: URI malformed',
    ]);
  });

  test('an exception that leaves an unsafe directory is seen, for an arrow and for a function', () => {
    expect(said(report().escapes).map((line) => line.split(':').slice(0, 3).join(':'))).toEqual([
      'src/unsafe/api.ts:7 parseUser: SyntaxError',
      'src/unsafe/api.ts:13 firstTag: URIError',
    ]);
  });

  test('a cast whose value does not have the shape of its type is seen', () => {
    expect(said(report().miscasts)).toEqual(['src/unsafe/api.ts:9 User: .id: string expected, number found']);
  });

  test('a value declared read-only where it is made is frozen: changing it throws', () => {
    expect(output['frozen']).toBe('threw TypeError');
  });

  test('what ran without throwing is counted, as evidence', () => {
    expect(report().quiet).toMatchObject({ 'String.trim': 1, 'String.split': 1, 'Number.toFixed': 1, 'ArrayBufferConstructor.new': 1, decodeURIComponent: 1, 'JSON.parse': 2 });
  });

  test('the report says it in words, and fails', () => {
    const text = formatReport(report());
    expect(text[0]).toBe('The ledger says these do not throw, and they threw:');
    expect(text.at(-1)).toMatch(/^4 contradictions; \d+ library functions ran \d+ times without throwing$/);
    expect(hasFailures(report())).toBe(true);
  });

  test('the command line reads the events file: exit code 1 on a contradiction, 2 when there is nothing to read', () => {
    const out: string[] = [];
    const err: string[] = [];
    const io = { cwd: directory, out: (line: string) => out.push(line), err: (line: string) => err.push(line) };
    expect(run(['report', 'events.jsonl'], io)).toBe(1);
    expect(out.join('\n')).toContain('An exception left an unsafe directory:');
    expect(run(['report', 'nothing.jsonl'], io)).toBe(2);
    expect(run(['explode'], io)).toBe(2);
    expect(run(['--help'], io)).toBe(0);
  });
});

describe('the instrumented module', () => {
  test('carries its own runtime and a source map shifted by the header', () => {
    const instrumenter = openInstrumenter(fixture, undefined, events);
    const emitted = instrumenter.ok ? instrumenter.value.emit(join(fixture, 'src/pricing.ts')) : undefined;
    const module = emitted?.ok && emitted.value.some ? emitted.value.value : undefined;
    expect(module?.sites).toBe(5);
    expect(module?.code.startsWith('const __strictTsProbe$ = (function install(file)')).toBe(true);
    expect(module?.code).not.toMatch(/^import /m);
    // The first line of the module itself is as far down as the map says.
    const lines = module?.code.split('\n') ?? [];
    const first = lines.findIndex((line) => line.startsWith('// Safe code that the gate accepts'));
    expect(first).toBeGreaterThan(20);
    const mappings: string = JSON.parse(module?.map ?? '{}').mappings;
    expect(mappings.startsWith(''.padEnd(first, ';'))).toBe(true);
    expect(mappings[first + 1]).not.toBe(undefined);
  });

  test('a file that is not of the project is left alone', () => {
    const instrumenter = openInstrumenter(fixture, undefined, events);
    const emitted = instrumenter.ok ? instrumenter.value.emit(join(fixture, 'tsconfig.json')) : undefined;
    expect(emitted?.ok && emitted.value.some).toBe(false);
  });

  test('the plugin gives a test runner the instrumented code of project files only', () => {
    const plugin = strictTsProbe({ events: join(directory, 'plugin.jsonl') });
    if (!plugin.ok) throw new Error(plugin.error);
    expect(plugin.value.name).toBe('strict-ts-probe');
    expect(plugin.value.transform('', join(fixture, 'src/pricing.ts'))?.code).toContain('__strictTsProbe$.method(');
    expect(plugin.value.transform('', fileURLToPath(import.meta.url))).toBeNull();
    expect(plugin.value.transform('', join(fixture, 'src/pricing.css'))).toBeNull();
  });
});
