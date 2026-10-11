import { type Ledger, threatOf } from '@strict-ts/core';
import { type Mut, record } from '@strict-ts/std';
import type { Event, Site } from './events.js';

/** What the runs showed, sorted by what it means for what strict-ts took on trust. */
export interface Report {
  /** A function the ledger says does not throw was seen to throw: the ledger is wrong. */
  readonly contradictions: readonly Finding[];
  /** An exception left a function exported by an unsafe directory. */
  readonly escapes: readonly Finding[];
  /** A cast whose value did not have the shape of its type. */
  readonly miscasts: readonly Finding[];
  /** A function that is not in the ledger was seen to throw: an entry to add. */
  readonly unknownThrows: readonly Finding[];
  /** A function the ledger says throws did throw: as expected, kept as its evidence. */
  readonly confirmed: readonly Finding[];
  /** Functions of the compiler's libraries that ran without throwing, with how many times: evidence, not proof. */
  readonly quiet: Readonly<Record<string, number>>;
}

export interface Finding {
  readonly site: Site;
  readonly detail: string;
  /** How many times it was seen. */
  readonly count: number;
}

const where = (site: Site): string => `${site.file}:${site.line}:${site.column}`;

export function summarise(events: readonly Event[], ledger: Ledger): Report {
  const groups = new Map<string, { readonly bucket: keyof Omit<Report, 'quiet'>; readonly finding: Mut<{ site: Site; detail: string; count: number }> }>();
  const note = (bucket: keyof Omit<Report, 'quiet'>, site: Site, detail: string): void => {
    const key = `${bucket} ${where(site)} ${detail}`;
    const known = groups.get(key);
    if (known === undefined) groups.set(key, { bucket, finding: { site, detail, count: 1 } });
    else known.finding.count += 1;
  };
  const quiet: Mut<Record<string, number>> = {};

  for (const event of events) {
    if (event.type === 'escaped') note('escapes', event.site, event.error);
    else if (event.type === 'miscast') note('miscasts', event.site, `${event.at}: ${event.expected} expected, ${event.found} found`);
    else if (event.type === 'ran') {
      if (event.site.origin === 'library') quiet[event.site.name] = (quiet[event.site.name] ?? 0) + event.count;
    } else if (event.site.origin === 'library') {
      const effect = ledger[event.site.name];
      const expected = effect !== undefined && threatOf(effect, event.site.argumentCount ?? 0) !== undefined;
      note(effect === undefined ? 'unknownThrows' : expected ? 'confirmed' : 'contradictions', event.site, event.error);
    }
    // A function of a package that threw is what the rule already assumes: nothing to report.
  }

  const of = (bucket: keyof Omit<Report, 'quiet'>): readonly Finding[] =>
    [...groups.values()]
      .filter((group) => group.bucket === bucket)
      .map((group) => group.finding)
      .toSorted((a, b) => (a.site.file === b.site.file ? a.site.line - b.site.line || a.site.column - b.site.column : a.site.file < b.site.file ? -1 : 1));
  return {
    contradictions: of('contradictions'),
    escapes: of('escapes'),
    miscasts: of('miscasts'),
    unknownThrows: of('unknownThrows'),
    confirmed: of('confirmed'),
    quiet: record(Object.entries(quiet).toSorted(([a], [b]) => (a < b ? -1 : 1))),
  };
}

/** The report as text. The first three kinds are failures: something strict-ts took on trust was wrong. */
export function formatReport(report: Report): readonly string[] {
  const section = (title: string, findings: readonly Finding[], say: (finding: Finding) => string): readonly string[] =>
    findings.length === 0 ? [] : [title, ...findings.map((finding) => `  ${where(finding.site)} ${say(finding)}${finding.count > 1 ? ` (${finding.count} times)` : ''}`), ''];
  const failures = report.contradictions.length + report.escapes.length + report.miscasts.length;
  const functions = Object.keys(report.quiet).length;
  const calls = Object.values(report.quiet).reduce((sum, count) => sum + count, 0);
  return [
    ...section('The ledger says these do not throw, and they threw:', report.contradictions, (f) => `\`${f.site.name}\` threw ${f.detail}`),
    ...section('An exception left an unsafe directory:', report.escapes, (f) => `\`${f.site.name}\` let through ${f.detail}`),
    ...section('A cast was not true:', report.miscasts, (f) => `as ${f.site.name}: ${f.detail}`),
    ...section('Not in the ledger, and seen to throw:', report.unknownThrows, (f) => `\`${f.site.name}\` threw ${f.detail}`),
    ...section('As the ledger says:', report.confirmed, (f) => `\`${f.site.name}\` threw ${f.detail}`),
    `${failures} ${failures === 1 ? 'contradiction' : 'contradictions'}; ${functions} library functions ran ${calls} times without throwing`,
  ];
}

export const hasFailures = (report: Report): boolean => report.contradictions.length + report.escapes.length + report.miscasts.length > 0;
