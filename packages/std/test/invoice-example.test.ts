// The invoice challenge is the project's measure of what conforming code costs in lines: 39 against 58.
import { readFileSync } from 'node:fs';
import { expect, test, vi } from 'vitest';
import * as classic from '../../../examples/invoice/classic/invoice.js';
import * as strict from '../../../examples/invoice/strict/invoice.js';

const example = new URL('../../../examples/invoice/', import.meta.url);
const lines = (...files: readonly string[]): number =>
  files.reduce((sum, file) => sum + readFileSync(new URL(file, example), 'utf8').trimEnd().split('\n').length, 0);

const line = { label: 'Audit', quantity: 2, unitPrice: 50 };

test('the conforming version is not longer than the classic one', () => {
  expect(lines('classic/invoice.ts')).toBe(58);
  expect(lines('strict/invoice.ts', 'strict/unsafe/system.ts')).toBeLessThanOrEqual(39);
});

test('creating an invoice without lines is an error value, not an exception', () => {
  expect(() => classic.createInvoice('Ada', [])).toThrow();
  const refused = strict.createInvoice('Ada', []);
  expect(!refused.ok && refused.error).toBe('no-lines');
});

test('a created invoice is a draft with its total', () => {
  const created = strict.createInvoice('Ada', [line]);
  expect(created.ok && created.value.status).toBe('draft');
  expect(created.ok && strict.total(created.value)).toBe(100);
  expect(created.ok && strict.total(created.value)).toBe(classic.total(classic.createInvoice('Ada', [line])));
});

test('parsing proves the shape instead of casting', () => {
  const wrong = JSON.stringify({ id: 'i1', customer: 'Ada', status: 'lost', lines: [] });
  expect(classic.parseInvoice(wrong).status).toBe('lost');
  expect(strict.parseInvoice(wrong).ok).toBe(false);
  expect(strict.parseInvoice('{').ok).toBe(false);

  const right = strict.parseInvoice(JSON.stringify({ id: 'i1', customer: 'Ada', status: 'paid', lines: [line] }));
  expect(right.ok && strict.total(right.value)).toBe(100);
});

test('the first line of an empty invoice is none, not undefined typed as a line', () => {
  const empty = { id: 'i1', customer: 'Ada', status: 'draft' as const, lines: [] };
  expect(classic.firstLine({ ...empty, paidAt: null })).toBeUndefined();
  expect(strict.firstLine(empty).some).toBe(false);
  expect(strict.firstLine({ ...empty, lines: [line] }).unwrapOr(undefined)).toEqual(line);
});

test('every status has a label', () => {
  expect(classic.statusLabel('cancelled')).toBe('?');
  expect(strict.statusLabel('cancelled')).toBe('Cancelled');
});

test('reminders are awaited for sent invoices only', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const invoice = { id: 'i1', customer: 'Ada', lines: [line] };
  await strict.remindUnpaid([
    { ...invoice, status: 'sent' },
    { ...invoice, status: 'paid' },
  ]);
  expect(log.mock.calls).toEqual([['Reminder sent to Ada (100 €)']]);
  log.mockRestore();
});
