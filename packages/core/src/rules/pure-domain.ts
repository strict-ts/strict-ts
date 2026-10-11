import { isPure } from '../config.js';
import type { Rule } from '../rule.js';

/** What reaches outside the program, or depends on when and where it runs. */
const EFFECTS: Readonly<Record<string, string>> = {
  console: 'writes to the console',
  process: 'reads the process',
  fetch: 'reaches the network',
  XMLHttpRequest: 'reaches the network',
  WebSocket: 'reaches the network',
  setTimeout: 'depends on time',
  setInterval: 'depends on time',
  setImmediate: 'depends on time',
  queueMicrotask: 'depends on time',
  performance: 'reads the clock',
  crypto: 'is a source of randomness',
  localStorage: 'is global state',
  sessionStorage: 'is global state',
  document: 'is global state',
  window: 'is global state',
  navigator: 'is global state',
  globalThis: 'is global state',
  require: 'loads a module at run time',
};
/** `Object.member` pairs that are effects, on objects that are otherwise pure. */
const MEMBERS: Readonly<Record<string, string>> = { 'Math.random': 'is a source of randomness', 'Date.now': 'reads the clock' };

const help = 'Take the value as a parameter, and let the code outside the pure directories produce it.';

/** `a/b/../c` as `a/c`; undefined when the path leaves the project. */
const resolved = (from: string, specifier: string): string | undefined => {
  const parts = from.split('/').slice(0, -1);
  for (const part of specifier.split('/')) {
    if (part === '.' || part === '') continue;
    if (part !== '..') parts.push(part);
    else if (parts.pop() === undefined) return undefined;
  }
  return parts.join('/');
};

export const pureDomain: Rule = {
  name: 'pure-domain',
  guarantee: 'mutability',
  description: 'In a directory declared pure: no I/O, no clock, no randomness, no global state, and no import of code that is not pure.',
  scope: 'safe',
  visit(node, { file, config, report }) {
    if (!isPure(file.name, config)) return;
    if (node.kind === 'module-state') {
      report(node, 'Module-level state in a pure directory.', 'Declare it `const`, or keep the state outside and pass it in.');
    } else if (node.kind === 'identifier' && node.text in EFFECTS && node.declaredOutside) {
      report(node, `\`${node.text}\` ${EFFECTS[node.text] ?? ''}: not allowed in a pure directory.`, help);
    } else if (node.kind === 'property-access' && node.object.kind === 'identifier' && node.object.declaredOutside) {
      const effect = MEMBERS[`${node.object.text}.${node.name}`];
      if (effect !== undefined) report(node, `\`${node.object.text}.${node.name}\` ${effect}: not allowed in a pure directory.`, help);
    } else if (node.kind === 'new' && node.callee.kind === 'identifier' && node.callee.text === 'Date' && node.argumentCount === 0) {
      report(node, '`new Date()` reads the clock: not allowed in a pure directory.', help);
    } else if (node.kind === 'call' && node.callee.kind === 'identifier' && node.callee.text === 'Date' && node.callee.declaredOutside) {
      report(node, '`Date()` reads the clock: not allowed in a pure directory.', help);
    } else if (node.kind === 'module-reference' && node.specifier?.kind === 'string-literal') {
      const specifier = node.specifier.text;
      if (!specifier.startsWith('.')) return; // A package: the business of no-external-import.
      const target = resolved(file.name, specifier);
      if (target === undefined || !isPure(target, config)) {
        report(node.specifier, `Import of "${specifier}", which is outside the pure directories.`, 'A pure file imports pure files only: move what it needs, or pass it in.');
      }
    }
  },
};
