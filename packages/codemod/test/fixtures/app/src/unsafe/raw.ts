// unsafe/ is not the fixer's business: the rule does not run here.
export const copy = (items: string[]): { ok: true; value: string[] } => ({ ok: true, value: [...items] });
