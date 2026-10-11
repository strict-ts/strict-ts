import { domObserved, domThrows } from './dom.js';
import { generated, observed } from './generated.js';

export { getters, gettersWhenDetached, operandClasses, operators } from './generated.js';
import type { Effect, Ledger } from './ledger.js';
import { record } from '../record.js';
import { seed } from './seed.js';

/**
 * The ledger the rules read. What was derived by running the functions wins over what was judged by hand; a hand
 * entry that the runs did not contradict gains their count as evidence. A function of the DOM that was only seen
 * not to throw, and that nobody judged, is in it as such: `observedOnly`.
 */
export const ledger: Ledger = record([
  ...Object.entries(domObserved).flatMap(([name, runs]): readonly (readonly [string, Effect])[] =>
    name in seed || name in generated || name in domThrows ? [] : [[name, { verdict: 'total', observedOnly: true, evidence: { runs } }]],
  ),
  ...Object.entries({ ...seed, ...generated, ...domThrows }).map(([name, effect]): readonly [string, Effect] => {
    const runs = observed[name] ?? domObserved[name];
    return [name, runs === undefined || effect.evidence.runs !== undefined ? effect : { ...effect, evidence: { ...effect.evidence, runs } }];
  }),
]);
