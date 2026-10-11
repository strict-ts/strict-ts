// "Safe" code: no any, no cast, no throw, no null, no external import.
import { panic, s } from "@strict-ts/std";

// The schema is the only definition: the type and the validation both derive from it.
export const User = s.object({
  id: s.string,
  name: s.string,
  role: s.literal("admin", "nurse", "patient"),
});
export type User = s.Infer<typeof User>;
export type Role = User["role"];

// A `satisfies` object instead of a switch: forgetting a role is a compile error.
const permissionsByRole = {
  admin: ["read", "write", "admin"],
  nurse: ["read", "write"],
  patient: ["read"],
} satisfies Readonly<Record<Role, readonly string[]>>;

export const permissions = (role: Role) => permissionsByRole[role];

// A role without a permission would be a bug, not a domain error: panic rather than one more Result.
export const mainPermission = (role: Role) => permissions(role)[0] ?? panic(`the role ${role} has no permission`);
