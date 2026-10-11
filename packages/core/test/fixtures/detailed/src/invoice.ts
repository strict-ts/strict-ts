// Detailed solution (v1 style): validation by hand, free functions, errors as objects.
import { andThen, err, fromUndefined, map, mapErr, type Mut, none, ok, some, type Option, type Result } from "@strict-ts/std";
import { newId, parseJson } from "./unsafe/system.js";

type Status = "draft" | "sent" | "paid" | "cancelled";

interface Line {
  readonly label: string;
  readonly quantity: number;
  readonly unitPrice: number;
}

export interface Invoice {
  readonly id: string;
  readonly customer: string;
  readonly lines: readonly Line[];
  readonly status: Status;
  readonly paidAt: Option<Date>;
}

export type InvoiceError =
  | { readonly kind: "no-lines" }
  | { readonly kind: "system"; readonly message: string }
  | { readonly kind: "invalid"; readonly reason: string };

export function createInvoice(customer: string, lines: readonly Line[]): Result<Invoice, InvoiceError> {
  if (lines.length === 0) return err({ kind: "no-lines" });
  return map(newId(), (id): Invoice => ({ id, customer, lines, status: "draft", paidAt: none }));
}

export function total(invoice: Invoice): number {
  return invoice.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
}

const invalid = (reason: string): Result<never, InvoiceError> => err({ kind: "invalid", reason });

function isStatus(value: string) {
  return value === "draft" || value === "sent" || value === "paid" || value === "cancelled";
}

function parseLine(raw: unknown): Result<Line, InvoiceError> {
  if (typeof raw !== "object" || raw === null) return invalid("line: object expected");
  if (!("label" in raw) || typeof raw.label !== "string") return invalid("line: label");
  if (!("quantity" in raw) || typeof raw.quantity !== "number") return invalid("line: quantity");
  if (!("unitPrice" in raw) || typeof raw.unitPrice !== "number") return invalid("line: unitPrice");
  return ok({ label: raw.label, quantity: raw.quantity, unitPrice: raw.unitPrice });
}

function parseLines(raw: unknown): Result<readonly Line[], InvoiceError> {
  if (!Array.isArray(raw)) return invalid("lines: array expected");
  const items: readonly unknown[] = raw;
  const lines: Mut<Line[]> = [];
  for (const item of items) {
    const line = parseLine(item);
    if (!line.ok) return line;
    lines.push(line.value);
  }
  return ok(lines);
}

/** Parse rather than cast: every field is proven before the Invoice is built. */
export function parseInvoice(json: string): Result<Invoice, InvoiceError> {
  return andThen(parseJson(json), (raw): Result<Invoice, InvoiceError> => {
    if (typeof raw !== "object" || raw === null) return invalid("object expected");
    if (!("id" in raw) || typeof raw.id !== "string") return invalid("id");
    if (!("customer" in raw) || typeof raw.customer !== "string") return invalid("customer");
    if (!("status" in raw) || typeof raw.status !== "string" || !isStatus(raw.status)) return invalid("status");
    const paidAt: Option<Date> =
      "paidAt" in raw && typeof raw.paidAt === "string" ? some(new Date(raw.paidAt)) : none;
    const id = raw.id;
    const customer = raw.customer;
    const status = raw.status;
    return map(parseLines("lines" in raw ? raw.lines : undefined), (lines): Invoice => ({ id, customer, lines, status, paidAt }));
  });
}

export function firstLine(invoice: Invoice): Option<Line> {
  return fromUndefined(invoice.lines[0]);
}

export function statusLabel(status: Status): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "sent":
      return "Sent";
    case "paid":
      return "Paid";
    case "cancelled":
      return "Cancelled";
  }
}

export async function sendReminder(invoice: Invoice): Promise<void> {
  console.log(`Reminder sent to ${invoice.customer} (${total(invoice)} €)`);
}

export async function remindUnpaid(invoices: readonly Invoice[]): Promise<void> {
  for (const invoice of invoices) {
    if (invoice.status === "sent") await sendReminder(invoice);
  }
}

/** Example of use: the system's errors and the domain's combine in a single type. */
export function describe(json: string): string {
  const parsed = mapErr(parseInvoice(json), (e) => (e.kind === "invalid" ? `Invalid field: ${e.reason}` : e.kind));
  return parsed.ok ? `${parsed.value.customer}: ${total(parsed.value)} €` : parsed.error;
}
