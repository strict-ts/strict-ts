// unsafe/: the plugin a Vite or Vitest configuration loads, so that tests run the instrumented code.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { attempt, none, type Option, type Result, some } from '@strict-ts/std';
import type { Probes } from '../transform.js';
import { type Instrumenter, openInstrumenter } from './emit.js';

export interface ProbeOptions {
  /** Where the probes append what they see. Relative to where the tests run. */
  readonly events?: string;
  readonly probes?: Probes;
  /** Leave these files alone, by a piece of their path. */
  readonly exclude?: readonly string[];
}

/** The little of a Vite plugin that this one is. */
export interface VitePlugin {
  readonly name: string;
  readonly enforce: 'pre';
  readonly transform: (code: string, id: string) => { readonly code: string; readonly map: string | null } | null;
}

/**
 * A Vite plugin that replaces each TypeScript file of a project by its instrumented JavaScript. A file that belongs
 * to no project, or that its project does not compile (a test), is left to Vite.
 */
export function strictTsProbe(options: ProbeOptions = {}): Result<VitePlugin, string> {
  return attempt((): VitePlugin => {
    // Declared here, inside what `attempt` catches: it reads the file system.
    const nearestProject = (fileName: string): Option<string> => {
      let directory = dirname(fileName);
      for (let depth = 0; depth < 30; depth++) {
        if (existsSync(join(directory, 'tsconfig.json'))) return some(directory);
        const parent = dirname(directory);
        if (parent === directory) return none;
        directory = parent;
      }
      return none;
    };
    const events = join(process.cwd(), options.events ?? '.strict-ts-probe/events.jsonl');
    const opened = new Map<string, Option<Instrumenter>>();
    const instrumenterOf = (directory: string): Option<Instrumenter> => {
      const known = opened.get(directory);
      if (known !== undefined) return known;
      const made = openInstrumenter(directory, undefined, events, options.probes);
      const result = made.ok ? some(made.value) : none;
      opened.set(directory, result);
      return result;
    };
    return {
      name: 'strict-ts-probe',
      enforce: 'pre',
      transform: (_code, id) => {
        const fileName = id.split('?')[0] ?? id;
        if (!/\.[cm]?tsx?$/.test(fileName) || fileName.includes('/node_modules/')) return null;
        if ((options.exclude ?? []).some((piece) => fileName.includes(piece))) return null;
        const emitted = nearestProject(fileName)
          .map(instrumenterOf)
          .unwrapOr(none)
          .map((instrumenter) => instrumenter.emit(fileName).unwrapOr(none))
          .unwrapOr(none);
        return emitted.some ? { code: emitted.value.code, map: emitted.value.map ?? null } : null;
      },
    };
  }, String);
}
