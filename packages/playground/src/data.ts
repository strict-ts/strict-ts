// What the build embeds in the page.
import type { Environment } from './engine.js';

export interface Scenario {
  readonly id: string;
  readonly label: string;
  readonly intro: string;
  readonly flags: Readonly<Record<string, boolean>>;
  readonly files: Readonly<Record<string, string>>;
}

export interface Data {
  readonly tsVersion: string;
  readonly scenarios: readonly Scenario[];
  readonly env: Environment;
}
