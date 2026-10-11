import { describe, expect, test } from 'vitest';
import { effectsLedger, hasShape, type Shape, threatOf } from '../src/index.js';

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
    // What is left by hand: the DOM, which has no specification this project reads, and a handful of others.
    expect(byHand.length).toBeLessThanOrEqual(40);
  });

  test('the DOM is in the ledger as it was seen in a browser, and never as proven', () => {
    const dom = entries.filter(([, effect]) => effect.observedOnly === true);
    expect(dom.length).toBeGreaterThan(600);
    for (const [name, effect] of dom) expect(effect.evidence, name).toEqual({ runs: expect.any(Number) });
    expect(effectsLedger['ParentNode.querySelector']).toMatchObject({ verdict: 'throws', evidence: { example: expect.stringContaining('SyntaxError') } });
    expect(effectsLedger['Document.createElement']?.verdict).toBe('throws');
    const fill = effectsLedger['CanvasRect.fillRect'];
    expect(fill).toEqual({ verdict: 'total', observedOnly: true, evidence: { runs: 80 } });
    expect(fill === undefined ? undefined : threatOf(fill, 4)).toBe('was only seen not to throw (80 calls in a browser): nothing was read that says it cannot');
    expect(fill === undefined ? undefined : threatOf(fill, 4, false, false, true)).toBeUndefined();
    // Judged by hand to throw, and never seen to: the judgement stays.
    expect(effectsLedger['Storage.setItem']?.verdict).toBe('throws');
  });

  test('the written arguments a function of the DOM is quiet on: on one that throws, written by hand, and run', () => {
    const written = entries.filter(([, effect]) => effect.written !== undefined);
    expect(written.map(([name]) => name).toSorted()).toEqual([
      'CanvasGradient.addColorStop',
      'DOMTokenList.add',
      'DOMTokenList.remove',
      'DOMTokenList.replace',
      'DOMTokenList.toggle',
      'Document.createElement',
      'Element.closest',
      'Element.matches',
      'Element.setAttribute',
      'ParentNode.querySelector',
      'ParentNode.querySelectorAll',
    ]);
    for (const [name, effect] of written) {
      expect(effect.verdict, name).toBe('throws');
      expect(effect.written?.runs ?? 0, name).toBeGreaterThan(1000);
      expect(effect.written?.clause.length ?? 0, name).toBeGreaterThan(20);
    }
  });

  test('a shape lets through less than the browser does, never more', () => {
    const shaped = (shape: Shape, values: readonly unknown[]) => values.filter((value) => hasShape(shape, value));
    expect(shaped('token', ['hidden', 'app--shake', 'é', '', 'two words', 'tab\there', 'line\n', 7])).toEqual(['hidden', 'app--shake', 'é']);
    expect(shaped('element-name', ['div', 'canvas', 'my-element', 'h1', '', 'Div', '1st', 'a b', 'a--b', '-a', 'é'])).toEqual(['div', 'canvas', 'my-element', 'h1']);
    expect(shaped('attribute-name', ['role', 'aria-hidden', 'data-theme', 'data-a-b1', 'onclick', 'src', 'href', 'class', 'data-', 'aria', 'DATA-X'])).toEqual(['role', 'aria-hidden', 'data-theme', 'data-a-b1']);
    expect(
      shaped('selector', ['#menu', '.planet-card-visual', '[data-move]', 'button.upgrade-btn', 'input, select, [role="dialog"]', 'ul > li + li ~ p', '*', ' div ', '', '#1st', 'li:not(.a)', 'a:hover', 'a >', '> a', 'a,,b', '[a=]', '.é', 'a\\.b']),
    ).toEqual(['#menu', '.planet-card-visual', '[data-move]', 'button.upgrade-btn', 'input, select, [role="dialog"]', 'ul > li + li ~ p', '*', ' div ']);
    expect(shaped('colour', ['#fff', '#ffff', '#a1b2c3', '#a1b2c3d4', 'rgb(1,2,3)', 'rgba(15, 23, 42, 0.15)', 'rgba(0,0,0,0)', '#ff', '#ggg', 'tomato', 'rgb(1 2 3)', 'rgb(1,2)', 'hsl(1,2%,3%)', ''])).toEqual([
      '#fff',
      '#ffff',
      '#a1b2c3',
      '#a1b2c3d4',
      'rgb(1,2,3)',
      'rgba(15, 23, 42, 0.15)',
      'rgba(0,0,0,0)',
    ]);
    expect(shaped('unit', [0, 1, 0.55, -0.1, 1.5, Number.NaN, '0'])).toEqual([0, 1, 0.55]);
  });

  test('a function is called safe only when the specification and the runs agree', () => {
    // What was only observed (the DOM) is not called safe: it is refused unless a project takes the runs as enough.
    const safe = entries.filter(([, effect]) => effect.verdict === 'total' && effect.evidence.byHand === undefined && effect.observedOnly !== true);
    expect(safe.length).toBeGreaterThan(250);
    for (const [name, effect] of safe) {
      // The id of the clause: `sec-…`, or the name itself in the annex of legacy functions.
      expect(effect.evidence.spec, name).toMatch(/^(?:sec-|String\.prototype\.)/);
      expect(effect.evidence.runs, name).toBeGreaterThan(100);
    }
  });

  test('what the runs showed wins over a judgement: join was judged safe, and throws on a symbol', () => {
    expect(effectsLedger['Array.join']).toMatchObject({ verdict: 'throws', unprintable: true });
    expect(effectsLedger['ReadonlyArray.reduce']).toMatchObject({ verdict: 'throws', below: 2 });
    expect(effectsLedger['Number.toString']).toMatchObject({ verdict: 'throws', atLeast: 1 });
    expect(effectsLedger['String.padEnd']?.verdict).toBe('total');
    expect(effectsLedger['String.padEnd']?.evidence).toEqual({ runs: 600, spec: 'sec-string.prototype.padend' });
  });

  test('a function that only throws on what it cannot convert is safe on plain values', () => {
    const join = effectsLedger['Array.join'];
    expect(join === undefined ? undefined : threatOf(join, 0, true)).toBeUndefined();
    expect(join === undefined ? undefined : threatOf(join, 0, false)).toMatch(/cannot convert/);
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
