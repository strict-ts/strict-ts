import { type Config, assumptions, defaultConfig, rules } from '@strict-ts/core';
import { err, ok, type Option, type Result, s } from '@strict-ts/std';
import { configSchema } from './config-schema.js';

/** The name of the configuration file, looked for beside tsconfig.json. Every key is optional. */
export const CONFIG_FILE = 'strict-ts.json';

/** Where the baseline is written when strict-ts.json does not say. */
export const BASELINE_FILE = 'strict-ts-baseline.json';

export interface Settings {
  /** What the rules read. */
  readonly config: Config;
  /** The path of the baseline file, relative to the project root. */
  readonly baseline: string;
}

export const defaultSettings: Settings = { config: defaultConfig, baseline: BASELINE_FILE };

const File = s.object({
  $schema: s.optional(s.string),
  unsafeDirs: s.optional(s.array(s.string)),
  allowedImports: s.optional(s.array(s.string)),
  pureDirs: s.optional(s.array(s.string)),
  assume: s.optional(s.array(s.string)),
  rules: s.optional(s.array(s.string)),
  baseline: s.optional(s.string),
});
/** The keys strict-ts.json may hold: those of its published schema. */
const KEYS = Object.keys(configSchema.properties);

/** Turns the content of strict-ts.json into settings. What it does not understand is an error. */
export function readSettings(content: Option<unknown>): Result<Settings, string> {
  if (!content.some) return ok(defaultSettings);
  const raw = content.value;
  const parsed = File.parse(raw);
  if (!parsed.ok) return err(`${CONFIG_FILE}: ${parsed.error.expected} expected at ${parsed.error.path || 'the root'}`);
  const unknownKey = typeof raw === 'object' && raw !== null ? Object.keys(raw).find((key) => !KEYS.includes(key)) : undefined;
  if (unknownKey !== undefined) return err(`${CONFIG_FILE}: unknown key "${unknownKey}" (${KEYS.filter((key) => key !== '$schema').join(', ')})`);

  const file = parsed.value;
  const unknownRule = file.rules?.find((name) => !rules.some((rule) => rule.name === name));
  if (unknownRule !== undefined) return err(`${CONFIG_FILE}: unknown rule "${unknownRule}"`);
  if (file.baseline === '') return err(`${CONFIG_FILE}: "baseline" is empty`);
  const base = {
    unsafeDirs: file.unsafeDirs ?? defaultConfig.unsafeDirs,
    allowedImports: file.allowedImports ?? defaultConfig.allowedImports,
  };
  const unknownAssumption = file.assume?.find((name) => !assumptions.some((known) => known === name));
  if (unknownAssumption !== undefined) return err(`${CONFIG_FILE}: unknown assumption "${unknownAssumption}" (${assumptions.join(', ')})`);
  const pure = file.pureDirs === undefined ? base : { ...base, pureDirs: file.pureDirs };
  const placed = file.assume === undefined ? pure : { ...pure, assume: assumptions.filter((known) => file.assume?.includes(known) === true) };
  return ok({
    config: file.rules === undefined ? placed : { ...placed, rules: file.rules },
    baseline: file.baseline ?? BASELINE_FILE,
  });
}
