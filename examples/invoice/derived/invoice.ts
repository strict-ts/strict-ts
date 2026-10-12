// The same solution with the types written as types: their schemas are generated (invoice.schema.ts).
import { err, Option } from "@strict-ts/std";
import { InvoiceSchema } from "./invoice.schema.js";
import { newId, parseJson } from "./unsafe/system.js";

export type Line = { readonly label: string; readonly quantity: number; readonly unitPrice: number };
export type Invoice = {
  readonly id: string;
  readonly customer: string;
  readonly status: "draft" | "sent" | "paid" | "cancelled";
  readonly lines: readonly Line[];
  readonly paidAt?: Date;
};

export const createInvoice = (customer: string, lines: readonly Line[]) =>
  lines.length === 0 ? err("no-lines") : newId().map((id): Invoice => ({ id, customer, lines, status: "draft" }));

export const total = (invoice: Invoice) => invoice.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);

export const parseInvoice = (json: string) => parseJson(json).andThen(InvoiceSchema.parse);

export const firstLine = (invoice: Invoice) => Option.from(invoice.lines[0]);

const labels = { draft: "Draft", sent: "Sent", paid: "Paid", cancelled: "Cancelled" } satisfies Readonly<Record<Invoice["status"], string>>;
export const statusLabel = (status: Invoice["status"]) => labels[status];

export async function sendReminder(invoice: Invoice): Promise<void> {
  console.log(`Reminder sent to ${invoice.customer} (${total(invoice)} €)`);
}

export async function remindUnpaid(invoices: readonly Invoice[]): Promise<void> {
  for (const invoice of invoices) if (invoice.status === "sent") await sendReminder(invoice);
}
