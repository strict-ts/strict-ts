import { err, ok, type Result } from '@strict-ts/std';

export function share(total: number, people: number): Result<number, 'nobody'> {
  if (people === 0) return err('nobody');
  return ok(total / people);
}

export function label(total: number, people: number): string {
  // The failure is a value: it cannot be forgotten.
  return share(total, people).match({ ok: (each) => `${each} each`, err: () => 'nobody to share with' });
}
