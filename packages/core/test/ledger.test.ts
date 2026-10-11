import { describe, expect, test } from 'vitest';
import { effectsLedger, threatOf } from '../src/index.js';

describe('the effects ledger', () => {
  const entries = Object.entries(effectsLedger);

  test('every entry says how it is known', () => {
    for (const [name, effect] of entries) {
      const { spec, runs, byHand } = effect.evidence;
      expect(spec !== undefined || runs !== undefined || byHand !== undefined, name).toBe(true);
    }
  });

  test('an entry that throws says what happens', () => {
    for (const [name, effect] of entries) {
      if (effect.verdict === 'throws') expect(effect.why?.length ?? 0, name).toBeGreaterThan(10);
    }
  });

  test('how many entries are still judgements, and not derived', () => {
    const byHand = entries.filter(([, effect]) => effect.evidence.spec === undefined && effect.evidence.runs === undefined);
    // To bring down: each one of these is a person's word.
    expect(byHand.length).toBeLessThanOrEqual(205);
  });

  test('threatOf reads the conditions on the number of arguments', () => {
    const evidence = { byHand: 'test' };
    expect(threatOf({ verdict: 'total', evidence }, 0)).toBeUndefined();
    expect(threatOf({ verdict: 'throws', why: 'throws', evidence }, 3)).toBe('throws');
    expect(threatOf({ verdict: 'throws', why: 'throws', below: 2, evidence }, 1)).toBe('throws');
    expect(threatOf({ verdict: 'throws', why: 'throws', below: 2, evidence }, 2)).toBeUndefined();
    expect(threatOf({ verdict: 'throws', why: 'throws', atLeast: 1, evidence }, 0)).toBeUndefined();
    expect(threatOf({ verdict: 'throws', why: 'throws', atLeast: 1, evidence }, 1)).toBe('throws');
  });
});
