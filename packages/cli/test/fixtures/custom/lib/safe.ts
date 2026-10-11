export const nothing = null;
export function fail(): never {
  throw new Error("not checked: no-throw is not in the configuration");
}
