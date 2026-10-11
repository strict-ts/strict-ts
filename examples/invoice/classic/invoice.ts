// Challenge: "classic" TypeScript, which compiles with tsc --strict.
// Make it conform to strict-ts (0 errors) without breaking its behaviour.
import { randomUUID } from "node:crypto";

type Status = "draft" | "sent" | "paid" | "cancelled";

interface Line {
  label: string;
  quantity: number;
  unitPrice: number;
}

export interface Invoice {
  id: string;
  customer: string;
  lines: Line[];
  status: Status;
  paidAt: Date | null;
}

export function createInvoice(customer: string, lines: Line[]): Invoice {
  if (lines.length === 0) throw new Error("An invoice must have at least one line");
  return { id: randomUUID(), customer, lines, status: "draft", paidAt: null };
}

export function total(invoice: Invoice): number {
  return invoice.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
}

export function parseInvoice(json: string): Invoice {
  return JSON.parse(json) as Invoice;
}

export function firstLine(invoice: Invoice): Line {
  return invoice.lines[0]!;
}

export function statusLabel(status: Status): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "sent":
      return "Sent";
    case "paid":
      return "Paid";
  }
  return "?";
}

export async function sendReminder(invoice: Invoice): Promise<void> {
  console.log(`Reminder sent to ${invoice.customer} (${total(invoice)} €)`);
}

export function remindUnpaid(invoices: Invoice[]): void {
  for (const invoice of invoices) {
    if (invoice.status === "sent") sendReminder(invoice);
  }
}
