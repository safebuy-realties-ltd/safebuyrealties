import type { Role } from "@/lib/auth";

export type ManageableRole =
  | "buyer"
  | "seller"
  | "professional"
  | "staff"
  | "admin"
  | "super_admin";

const ROLE_RANK: Record<ManageableRole, number> = {
  buyer: 0,
  seller: 0,
  professional: 1,
  staff: 2,
  admin: 3,
  super_admin: 4,
};

/** Roles the actor may assign when creating or updating users. */
export function assignableRoles(actorRole: Role | undefined): ManageableRole[] {
  const rank = actorRole ? (ROLE_RANK[actorRole as ManageableRole] ?? 0) : 0;
  return (Object.keys(ROLE_RANK) as ManageableRole[]).filter((r) => ROLE_RANK[r] <= rank);
}

export function canAssignRole(actorRole: Role | undefined, target: ManageableRole): boolean {
  return assignableRoles(actorRole).includes(target);
}

export const PROFESSIONAL_TYPES = [
  "LAWYER",
  "SURVEYOR",
  "VALUER",
  "ARCHITECT",
  "ENGINEER",
  "BUILDER",
  "QUANTITY_SURVEYOR",
] as const;

export type ProfessionalType = (typeof PROFESSIONAL_TYPES)[number];
