import { parseJson, s } from '@strict-ts/std';

const Invoice = s.object({ id: s.string, total: s.number });

// Both failures are in the type: a Result, read by who calls.
export const parseInvoice = (json: string) => parseJson(json).andThen(Invoice.parse);
