// Concise solution (@strict-ts/std): Result with methods, schemas, `satisfies` object.
import { err, Option, s } from "@strict-ts/std";
import { newId, parseJson } from "./unsafe/system.js";

const Line = s.object({ label: s.string, quantity: s.number, unitPrice: s.number });
const Invoice = s.object({
  id: s.string,
  customer: s.string,
  status: s.literal("draft", "sent", "paid", "cancelled"),
  lines: s.array(Line),
  paidAt: s.optional(s.date),
});
type Line = s.Infer<typeof Line>;
export type Invoice = s.Infer<typeof Invoice>;

export const createInvoice = (customer: string, lines: Line[]) =>
  lines.length === 0 ? err("no-lines") : newId().map((id): Invoice => ({ id, customer, lines, status: "draft" }));

export const total = (invoice: Invoice) => invoice.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);

export const parseInvoice = (json: string) => parseJson(json).andThen(Invoice.parse);

export const firstLine = (invoice: Invoice) => Option.from(invoice.lines[0]);

const labels = { draft: "Draft", sent: "Sent", paid: "Paid", cancelled: "Cancelled" } satisfies Record<Invoice["status"], string>;
export const statusLabel = (status: Invoice["status"]) => labels[status];

export async function sendReminder(invoice: Invoice): Promise<void> {
  console.log(`Reminder sent to ${invoice.customer} (${total(invoice)} €)`);
}

export async function remindUnpaid(invoices: Invoice[]): Promise<void> {
  for (const invoice of invoices) if (invoice.status === "sent") await sendReminder(invoice);
}
