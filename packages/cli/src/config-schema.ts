import { rules } from '@strict-ts/core';
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
