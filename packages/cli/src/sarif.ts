import type { Diagnostic, Rule } from '@strict-ts/core';
import { json } from './json.js';

export interface SarifInput {
  readonly version: string;
  /** The rules that ran: they describe themselves in `tool.driver.rules`. */
  readonly rules: readonly Rule[];
  /** What fails the gate. */
  readonly refused: readonly Diagnostic[];
  /** What a baseline allows; empty when none is used. */
  readonly baselined: readonly Diagnostic[];
  /** Whether a baseline was compared with: results then carry a `baselineState`. */
  readonly usesBaseline: boolean;
}

const result = (d: Diagnostic, level: 'error' | 'note', baselineState: 'new' | 'unchanged' | undefined): object => ({
  ruleId: d.rule,
  level,
  message: { text: d.message },
  // A diagnostic about the project as a whole has no place in a file.
  ...(d.file === '' || d.start.line === 0
    ? {}
    : {
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: d.file },
              region: {
                startLine: d.start.line,
                startColumn: d.start.column,
                endLine: d.end.line,
                endColumn: d.end.column,
              },
            },
          },
        ],
      }),
  ...(baselineState === undefined ? {} : { baselineState }),
  ...(d.help === undefined ? {} : { properties: { help: d.help } }),
});

const byPlace = (a: Diagnostic, b: Diagnostic): number =>
  (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || a.start.line - b.start.line || a.start.column - b.start.column;

/**
 * One SARIF 2.1.0 log: one run, one result per diagnostic, the baselined ones included as notes so that a viewer
 * shows what is tolerated beside what is new.
 */
export function formatSarif({ version, rules, refused, baselined, usesBaseline }: SarifInput): string {
  const results = [
    ...refused.map((d) => ({ d, level: 'error' as const, state: usesBaseline ? ('new' as const) : undefined })),
    ...baselined.map((d) => ({ d, level: 'note' as const, state: 'unchanged' as const })),
  ].toSorted((a, b) => byPlace(a.d, b.d));
  const log = {
    $schema: 'https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'strict-ts',
            version,
            rules: rules.map((rule) => ({
              id: rule.name,
              shortDescription: { text: rule.description },
              properties: { guarantee: rule.guarantee, scope: rule.scope },
            })),
          },
        },
        results: results.map(({ d, level, state }) => result(d, level, state)),
      },
    ],
  };
  return json(log, 2);
}
