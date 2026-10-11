// Existing code, as a team finds it the day it adopts strict-ts: 3 violations here.
export function parseOrder(json: string): { readonly id: string } {
  const order = JSON.parse(json);
  if (json === "") throw new Error("empty");
  return order as { readonly id: string };
}
