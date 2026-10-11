// Turns what the runs showed and what the specification says into ledger entries.
//
//   the specification    the runs              the entry
//   no way to throw      never threw           total                 ← both agree
//   only conversions     never threw           total                 the types exclude what the conversions refuse
//   a real way to throw  never threw           throws                the prudent one of the two
//   a detached buffer    never threw           throws when detached  a project may say it never detaches one
//   anything             threw on plain values throws, with the call it was seen on
//   anything             threw on odd values   throws, unless the receiver and arguments are plain
//   no way to throw      threw                 a contradiction: the reading of the specification is wrong. The entry
//                                              says throws, and the build fails unless the case is acknowledged.
//
// A function that was not run gets an entry only when the specification gives it a real way to throw.

const sum = (mode, field) => Object.values(mode ?? {}).reduce((total, count) => total + count[field], 0);

/** The condition on the number of arguments under which a mode threw, if there is a clean one. */
function condition(mode) {
  const counts = Object.entries(mode)
    .map(([count, tally]) => ({ count: Number(count), ...tally }))
    .filter((tally) => tally.runs >= 5)
    .toSorted((a, b) => a.count - b.count);
  const threw = counts.filter((tally) => tally.threw > 0);
  const quiet = counts.filter((tally) => tally.threw === 0);
  if (quiet.length === 0 || threw.length === 0) return {};
  const lowestQuiet = quiet[0].count;
  const highestQuiet = quiet.at(-1).count;
  if (threw.every((tally) => tally.count < lowestQuiet)) return { below: lowestQuiet };
  if (threw.every((tally) => tally.count > highestQuiet)) return { atLeast: threw[0].count };
  return {};
}

const example = (mode) => Object.values(mode).find((tally) => tally.example !== undefined)?.example;
const DETACHED = 'throws a TypeError on a buffer that was detached';
const UNPRINTABLE = 'throws on a value it cannot convert: a symbol, an object without a prototype, a cycle';

/**
 * `specified` maps a declared name to what the specification says of it: `{ id, real: string[], converts }`.
 * `acknowledged` maps a name to why the runs and the reading of the specification may differ for it.
 */
export function derive(library, observed, specified = new Map(), acknowledged = {}) {
  const entries = [];
  const quiet = {};
  const contradictions = [];
  const counts = { functions: library.length, ran: 0, total: 0, throws: 0, throwsUnlessPlain: 0, throwsBySpecificationOnly: 0, throwsWhenDetached: 0, neverThrewWithoutSpecification: 0, notRun: 0, contradictions: 0 };
  for (const declared of library) {
    const result = observed[declared.name];
    const spec = specified.get(declared.name);
    const ran = declared.runnable && result !== undefined && result.located && !result.timedOut && !result.crashed;
    const runs = ran ? sum(result.modes.plain, 'runs') + sum(result.modes.any, 'runs') : 0;
    const cited = spec === undefined ? {} : { spec: spec.id };

    if (!ran || runs === 0) {
      counts.notRun++;
      if (spec !== undefined && spec.real.length === 0 && spec.detached) {
        counts.throwsWhenDetached++;
        entries.push({ name: declared.name, verdict: 'throws', why: DETACHED, detached: true, evidence: { runs: 0, ...cited } });
      } else if (spec !== undefined && spec.real.length > 0) {
        counts.throwsBySpecificationOnly++;
        entries.push({ name: declared.name, verdict: 'throws', why: `may throw by the specification (${spec.real[0].slice(0, 90)})`, evidence: { runs: 0, ...cited } });
      }
      continue;
    }
    counts.ran++;
    const { plain, any } = result.modes;
    const threwPlain = sum(plain, 'threw') > 0;
    const threwOdd = sum(any, 'threw') > 0;
    if ((threwPlain || threwOdd) && spec !== undefined && spec.real.length === 0 && spec.converts === 'no') {
      counts.contradictions++;
      contradictions.push({ name: declared.name, seen: example(threwPlain ? plain : any), spec: spec.id, acknowledged: acknowledged[declared.name] });
    }
    if (threwPlain) {
      counts.throws++;
      const seen = example(plain);
      const [call, error] = seen.split(' → ');
      const article = /^[AEIO]/.test(error) ? 'an' : 'a';
      entries.push({ name: declared.name, verdict: 'throws', why: `throws ${article} ${error}, as seen with ${call}`, ...condition(plain), evidence: { runs, ...cited, example: seen } });
    } else if (threwOdd) {
      counts.throwsUnlessPlain++;
      entries.push({ name: declared.name, verdict: 'throws', why: UNPRINTABLE, unprintable: true, ...condition(any), evidence: { runs, ...cited, example: example(any) } });
    } else if (spec === undefined) {
      counts.neverThrewWithoutSpecification++;
      quiet[declared.name] = runs;
    } else if (spec.real.length > 0) {
      counts.throwsBySpecificationOnly++;
      entries.push({ name: declared.name, verdict: 'throws', why: `may throw by the specification (${spec.real[0].slice(0, 90)})`, evidence: { runs, ...cited } });
    } else if (spec.converts === 'object') {
      // By the specification a conversion may meet an object it refuses, and the declared types let one in. No run
      // found it; a run cannot try every object.
      counts.throwsUnlessPlain++;
      entries.push({ name: declared.name, verdict: 'throws', why: UNPRINTABLE, unprintable: true, evidence: { runs, ...cited } });
    } else if (spec.detached) {
      // Never threw, and by the specification it throws on a detached buffer only, which the runs do not make.
      counts.throwsWhenDetached++;
      entries.push({ name: declared.name, verdict: 'throws', why: DETACHED, detached: true, evidence: { runs, ...cited } });
    } else {
      counts.total++;
      entries.push({ name: declared.name, verdict: 'total', evidence: { runs, ...cited } });
    }
  }
  return { entries: entries.toSorted((a, b) => (a.name < b.name ? -1 : 1)), quiet, contradictions, summary: { counts, quiet, contradictions } };
}
