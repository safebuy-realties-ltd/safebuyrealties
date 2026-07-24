import type { Role } from "@/lib/auth";

export type NotificationNavigationTarget = {
  to: string;
  search?: Record<string, string>;
};

function isInternal(role: Role) {
  return role === "staff" || role === "admin" || role === "super_admin";
}

export function notificationEntityTarget(
  role: Role,
  entityType: string | null | undefined,
  entityId: string | null | undefined,
): NotificationNavigationTarget | null {
  if (!entityType || !entityId) return null;

  switch (entityType) {
    case "Listing":
      if (isInternal(role)) {
        return { to: "/dashboard/admin/workflow", search: { listing: entityId } };
      }
      if (role === "seller") {
        return { to: "/dashboard/seller/listings" };
      }
      return null;
    case "Transaction":
      if (role === "buyer") {
        return { to: "/dashboard/buyer/transactions" };
      }
      if (isInternal(role)) {
        return { to: "/dashboard/admin/workflow" };
      }
      return null;
    case "DueDiligenceOrder":
      if (role === "buyer") {
        return { to: "/dashboard/buyer/due-diligence" };
      }
      if (isInternal(role)) {
        return {
          to: "/dashboard/admin/due-diligence",
          search: { serviceId: entityId },
        };
      }
      return null;
    case "Task":
      if (role === "professional") {
        return { to: `/dashboard/professional/tasks/${entityId}` };
      }
      return null;
    case "VerificationStep":
      if (isInternal(role)) {
        return { to: "/dashboard/admin/workflow" };
      }
      return null;
    case "KycRecord":
      if (role === "buyer") {
        return { to: "/dashboard/buyer/kyc" };
      }
      if (isInternal(role)) {
        return { to: "/dashboard/admin/kyc" };
      }
      return null;
    default:
      return null;
  }
}
