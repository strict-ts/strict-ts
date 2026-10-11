// The examples of the repo are what its documentation shows: each classic one is refused for what it is about, each
// conforming one is accepted, and both do what their comments say when they run.
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import * as cart from '../../../examples/cart/strict/domain/cart.js';
import * as classicReport from '../../../examples/report/classic/report.js';
import * as report from '../../../examples/report/strict/report.js';
import * as classicTransfer from '../../../examples/transfer/classic/transfer.js';
import * as transfer from '../../../examples/transfer/strict/transfer.js';
import { run } from '../src/index.js';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const refused = (project: string) => {
  const out: string[] = [];
  const code = run(['-p', `examples/${project}`], { cwd: repo, out: (line) => out.push(line), err: () => undefined });
  const rules = out.flatMap((line) => / (no-[\w-]+|readonly-types|use-once|must-use) /.exec(line)?.[1] ?? []);
  return { code, count: rules.length, rules: [...new Set(rules)].toSorted() };
};

describe('the gate on the examples', () => {
  test.each(['report', 'cart', 'transfer'])('the conforming %s is accepted', (name) => {
    expect(refused(`${name}/strict`)).toEqual({ code: 0, count: 0, rules: [] });
  });

  test('the classic report is refused for each way it can throw', () => {
    const { code, count, rules } = refused('report/classic');
    expect(code).toBe(1);
    expect(count).toBe(15);
    expect(rules).toEqual(['no-any', 'no-throwing-call', 'no-throwing-operator', 'readonly-types']);
  });

  test('the classic cart is refused for what it changes', () => {
    expect(refused('cart/classic')).toEqual({ code: 1, count: 11, rules: ['no-param-mutation', 'readonly-types'] });
  });

  test('the classic transfer says nothing of its transaction, so only its throws and its types are refused', () => {
    expect(refused('transfer/classic')).toEqual({ code: 1, count: 7, rules: ['no-throw', 'readonly-types'] });
  });
});

describe('what the examples do when they run', () => {
  const sales = JSON.stringify([
    { product: 'Tea', cents: 450, tags: ['hot'] },
    { product: 'Teapot', cents: 2500, tags: [] },
  ]);
  const said = <T>(result: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: unknown }) => (result.ok ? result.value : `Err: ${String(result.error)}`);

  test('the classic report throws three different errors; the conforming one returns them', () => {
    expect(() => classicReport.report(sales, '(')).toThrow(SyntaxError);
    expect(() => classicReport.report('nope', 'tea')).toThrow(SyntaxError);
    expect(() => classicReport.report(sales, 'coffee')).toThrow(RangeError);
    expect(said(report.report(sales, 'tea'))).toBe('Tea: 4.50 [hot]\nTeapot: 25.00 []\naverage: 14.75');
    expect(said(report.report(sales, '('))).toMatch(/^Err: Invalid regular expression/);
    expect(said(report.report('nope', 'tea'))).toMatch(/^Err: Unexpected token/);
    expect(said(report.report(sales, 'coffee'))).toBe('Err: no sale matches');
  });

  test('the conforming cart leaves what it is given as it was', () => {
    const one = cart.add(cart.empty, { name: 'Tea', cents: 450, quantity: 2 });
    expect(cart.empty.items).toEqual([]);
    expect([cart.total(one, 5), cart.total(one, 1)]).toEqual([810, 900]);
    expect(cart.applyCoupon(one, 'X').items[0]?.cents).toBe(428);
    expect(one.items[0]?.cents).toBe(450);
  });

  test('the classic transfer throws on its own transaction; the conforming one cannot', () => {
    expect(() => classicTransfer.transfer('a', 'b', 100)).toThrow('already ended');
    expect(said(transfer.transfer('a', 'b', 100))).toEqual(['a -100', 'b +100']);
    expect(said(transfer.transfer('a', 'b', 0))).toBe('Err: nothing-to-move');
  });
});
