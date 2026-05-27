import type { Role } from "@/lib/auth";

export type NotificationNavigationTarget = {
  to: string;
  search?: Record<string, string>;
};

export function notificationEntityTarget(
  role: Role,
  entityType: string | null | undefined,
  entityId: string | null | undefined,
): NotificationNavigationTarget | null {
  if (!entityType || !entityId) return null;

  switch (entityType) {
    case "Listing":
      if (role === "staff" || role === "admin") {
        return { to: "/dashboard/staff/workflow", search: { listing: entityId } };
      }
      if (role === "seller") {
        return { to: "/dashboard/seller/listings" };
      }
      return null;
    case "Transaction":
      if (role === "buyer") {
        return { to: "/dashboard/buyer/transactions" };
      }
      if (role === "staff" || role === "admin") {
        return { to: "/dashboard/staff/workflow" };
      }
      return null;
    case "Task":
      if (role === "professional") {
        return { to: `/dashboard/professional/tasks/${entityId}` };
      }
      return null;
    case "VerificationStep":
      if (role === "staff" || role === "admin") {
        return { to: "/dashboard/staff/workflow" };
      }
      return null;
    case "KycRecord":
      if (role === "buyer") {
        return { to: "/dashboard/buyer/kyc" };
      }
      if (role === "staff" || role === "admin") {
        return { to: "/dashboard/staff/kyc" };
      }
      return null;
    default:
      return null;
  }
}
