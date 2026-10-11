// Reads the specification and writes the facts the ledger is built from (`spec/facts.json`). Needs the network the
// first time: the specification is fetched at the tag of its edition and kept in `.cache`.
//
//   node scripts/spec-facts.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { facts } from './spec.mjs';

/** ECMAScript 2023, the edition of the libraries the ledger reads (`lib.es2023`), at the tag its authors gave it. */
export const SPEC = { edition: 'es2023', source: 'https://raw.githubusercontent.com/tc39/ecma262/es2023/spec.html' };

const root = fileURLToPath(new URL('../', import.meta.url));
const cached = `${root}.cache/spec-${SPEC.edition}.html`;
if (!existsSync(cached)) {
  mkdirSync(`${root}.cache`, { recursive: true });
  const response = await fetch(SPEC.source);
  if (!response.ok) throw new Error(`cannot fetch the specification: ${response.status}`);
  writeFileSync(cached, await response.text());
}
const found = facts(readFileSync(cached, 'utf8'));
mkdirSync(`${root}spec`, { recursive: true });
writeFileSync(`${root}spec/facts.json`, `${JSON.stringify({ ...SPEC, clauses: found }, undefined, 1)}\n`);
console.log(`spec/facts.json: ${found.length} clauses with an algorithm, ${found.filter((clause) => !clause.operation).length} of them functions`);
