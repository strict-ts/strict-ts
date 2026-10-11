import { generated, observed } from './generated.js';
import type { Effect, Ledger } from './ledger.js';
import { record } from '../record.js';
import { seed } from './seed.js';

/**
 * The ledger the rules read. What was derived by running the functions wins over what was judged by hand; a hand
 * entry that the runs did not contradict gains their count as evidence.
 */
export const ledger: Ledger = record(
  Object.entries({ ...seed, ...generated }).map(([name, effect]): readonly [string, Effect] => {
    const runs = observed[name];
    return [name, runs === undefined || effect.evidence.runs !== undefined ? effect : { ...effect, evidence: { ...effect.evidence, runs } }];
  }),
);
