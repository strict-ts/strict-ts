import { none, type Option, some } from '@strict-ts/std';
import type ts from '@typescript/typescript6';

/**
 * Whether the server loaded the plugin for every project (an editor extension asked for it) and not because a
 * `tsconfig.json` names it. The server says so in the configuration it hands over, which it types `any`.
 */
export function loadedForEveryProject(info: ts.server.PluginCreateInfo): Option<true> {
  // SAFETY: read as unknown and tested before use; the server documents `{ name, global: true }` for a global plugin.
  const config: unknown = info.config;
  return typeof config === 'object' && config !== null && 'global' in config && config.global === true ? some(true) : none;
}
