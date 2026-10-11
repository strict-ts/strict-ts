type Status = "draft" | "sent";

// The body is the check: the compiler can infer this predicate.
export const isStatus = (value: string): value is Status => value === "draft" || value === "sent";

// The body proves nothing: without the annotation the narrowing below is lost, so the fix does not hold.
const isText = (value: unknown): value is string => value !== undefined;

export const size = (value: unknown): number => (isText(value) ? value.length : 0);

export const pick = (value: string): Status | undefined => (isStatus(value) ? value : undefined);
