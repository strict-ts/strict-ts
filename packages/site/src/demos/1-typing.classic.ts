interface Invoice {
  readonly id: string;
  readonly total: number;
}

// The text may not be JSON, and the JSON may not be an invoice.
export function parseInvoice(json: string): Invoice {
  return JSON.parse(json) as Invoice;
}
