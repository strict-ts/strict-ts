// Turns what the runs showed into ledger entries. Only what the runs can decide is decided here: a function that
// threw gets the verdict `throws`, with the conditions the runs show. One that never threw is evidence, not proof.

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

export function derive(library, observed) {
  const entries = [];
  const quiet = {};
  const counts = { functions: library.length, runnable: 0, ran: 0, notLocated: 0, timedOut: 0, throws: 0, throwsOnOddValuesOnly: 0, neverThrew: 0 };
  for (const declared of library) {
    if (!declared.runnable) continue;
    counts.runnable++;
    const result = observed[declared.name];
    if (result === undefined || !result.located) {
      counts.notLocated++;
      continue;
    }
    if (result.timedOut || result.crashed) {
      counts.timedOut++;
      continue;
    }
    const { plain, any } = result.modes;
    const runs = sum(plain, 'runs') + sum(any, 'runs');
    if (runs === 0) continue;
    counts.ran++;
    if (sum(plain, 'threw') > 0) {
      counts.throws++;
      const seen = example(plain);
      const [call, error] = seen.split(' → ');
      const article = /^[AEIO]/.test(error) ? 'an' : 'a';
      entries.push({ name: declared.name, verdict: 'throws', why: `throws ${article} ${error}, as seen with ${call}`, ...condition(plain), evidence: { runs, example: seen } });
    } else if (sum(any, 'threw') > 0) {
      counts.throwsOnOddValuesOnly++;
      entries.push({
        name: declared.name,
        verdict: 'throws',
        why: 'throws on a value it cannot convert: a symbol, an object without a prototype, a cycle',
        unprintable: true,
        ...condition(any),
        evidence: { runs, example: example(any) },
      });
    } else {
      counts.neverThrew++;
      quiet[declared.name] = runs;
    }
  }
  return { entries: entries.toSorted((a, b) => (a.name < b.name ? -1 : 1)), quiet, summary: { counts, quiet } };
}
