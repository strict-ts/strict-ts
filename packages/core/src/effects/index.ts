import { domObserved, domThrows } from './dom.js';
import { domWritten } from './dom-shapes.js';
import { generated, observed } from './generated.js';

export { getters, gettersWhenDetached, operandClasses, operators } from './generated.js';
import type { Effect, Ledger } from './ledger.js';
import { record } from '../record.js';
import { seed } from './seed.js';

/**
 * The ledger the rules read. What was derived by running the functions wins over what was judged by hand; a hand
 * entry that the runs did not contradict gains their count as evidence. A function of the DOM that was only seen
 * not to throw, and that nobody judged, is in it as such: `observedOnly`. One that was seen to throw carries, when
 * a person wrote them and the browser agreed, the shapes of the written arguments on which it does not.
 */
export const ledger: Ledger = record([
  ...Object.entries(domObserved).flatMap(([name, runs]): readonly (readonly [string, Effect])[] =>
    name in seed || name in generated || name in domThrows ? [] : [[name, { verdict: 'total', observedOnly: true, evidence: { runs } }]],
  ),
  ...Object.entries({ ...seed, ...generated, ...domThrows }).map(([name, effect]): readonly [string, Effect] => {
    const runs = observed[name] ?? domObserved[name];
    const counted = runs === undefined || effect.evidence.runs !== undefined ? effect : { ...effect, evidence: { ...effect.evidence, runs } };
    // The written arguments on which a function of the DOM that throws was seen not to.
    const written = name in domThrows ? domWritten[name] : undefined;
    return [name, written === undefined ? counted : { ...counted, written }];
  }),
]);
