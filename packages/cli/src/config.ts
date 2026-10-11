import { type Config, defaultConfig, rules } from '@strict-ts/core';
import { err, ok, type Option, type Result, s } from '@strict-ts/std';

/** The name of the configuration file, looked for beside tsconfig.json. Every key is optional. */
export const CONFIG_FILE = 'strict-ts.json';

const File = s.object({
  unsafeDirs: s.optional(s.array(s.string)),
  allowedImports: s.optional(s.array(s.string)),
  rules: s.optional(s.array(s.string)),
});
const KEYS = ['unsafeDirs', 'allowedImports', 'rules'];

/** Turns the content of strict-ts.json into a configuration. What it does not understand is an error. */
export function readConfig(content: Option<unknown>): Result<Config, string> {
  if (!content.some) return ok(defaultConfig);
  const raw = content.value;
  const parsed = File.parse(raw);
  if (!parsed.ok) return err(`${CONFIG_FILE}: ${parsed.error.expected} expected at ${parsed.error.path || 'the root'}`);
  const unknownKey = typeof raw === 'object' && raw !== null ? Object.keys(raw).find((key) => !KEYS.includes(key)) : undefined;
  if (unknownKey !== undefined) return err(`${CONFIG_FILE}: unknown key "${unknownKey}" (${KEYS.join(', ')})`);

  const file = parsed.value;
  const unknownRule = file.rules?.find((name) => !rules.some((rule) => rule.name === name));
  if (unknownRule !== undefined) return err(`${CONFIG_FILE}: unknown rule "${unknownRule}"`);
  const base = {
    unsafeDirs: file.unsafeDirs ?? defaultConfig.unsafeDirs,
    allowedImports: file.allowedImports ?? defaultConfig.allowedImports,
  };
  return ok(file.rules === undefined ? base : { ...base, rules: file.rules });
}
