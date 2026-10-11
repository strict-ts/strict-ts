// Existing code, as a team finds it the day it adopts strict-ts: 3 violations here.
export function parseOrder(json: string): { readonly id: string } {
  const order = Reflect.get(globalThis, json);
  if (json === "") throw new Error("empty");
  return order as { readonly id: string };
}
