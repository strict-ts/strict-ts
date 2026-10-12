import { assumptions, rules } from '@strict-ts/core';
import { json } from './json.js';

/**
 * The JSON schema of strict-ts.json, for completion and validation in the editor. It is published as
 * strict-ts.schema.json; a test keeps that file, this object and what `readSettings` accepts in step.
 */
export const configSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'strict-ts.json',
  description: 'The configuration of strict-ts, read beside tsconfig.json. Every key is optional.',
  type: 'object',
  additionalProperties: false,
  properties: {
    $schema: { type: 'string', description: 'The path or URL of this schema, for the editor.' },
    unsafeDirs: {
      type: 'array',
      items: { type: 'string' },
      default: ['src/unsafe'],
      description:
        'The directories where unchecked code may live, relative to the project root: the equivalent of `unsafe` in Rust.',
    },
    allowedImports: {
      type: 'array',
      items: { type: 'string' },
      default: ['@strict-ts/std'],
      description: 'The packages safe code may import. Everything else is imported from an unsafe directory only.',
    },
    pureDirs: {
      type: 'array',
      items: { type: 'string' },
      default: [],
      description:
        'The directories whose code must be pure, relative to the project root: no I/O, no clock, no randomness, no global state, no import of code that is not pure.',
    },
    testDirs: {
      type: 'array',
      items: { type: 'string' },
      default: ['test', 'tests'],
      description:
        'The directories that hold tests, relative to the project root. A file named *.test.* or *.spec.*, or under a __tests__ directory, is a test wherever it is. A test may throw, call what throws and import what it needs.',
    },
    assume: {
      type: 'array',
      items: { enum: [...assumptions] },
      uniqueItems: true,
      default: [],
      description:
        'What the project says of itself and that no rule can check. "attached-buffers": no buffer is ever detached, so the methods of typed arrays and of DataView do not throw for that. "dom-as-observed": a function of the DOM that never threw when it was run in a browser is taken not to throw, although no specification was read for it, and one that throws is taken not to on arguments written in the call, of a shape on which it never threw there. "generated-arguments": an argument that is not written in the call, and whose type is a text, a number or a boolean, is taken not to make the call throw when the gate ran the call on a list of such values and none did. "generated-receivers": a method called with arguments written in the call, that did not throw when the gate ran it on a list of receivers of its class, is taken not to throw.',
    },
    rules: {
      type: 'array',
      items: { enum: rules.map((rule) => rule.name) },
      uniqueItems: true,
      description: 'The rules to run. All of them when absent.',
    },
    baseline: {
      type: 'string',
      minLength: 1,
      default: 'strict-ts-baseline.json',
      description: 'The path of the baseline file, relative to the project root.',
    },
  },
} as const;

/** The file's exact content. */
export const serializeConfigSchema = (): string => `${json(configSchema, 2)}\n`;
