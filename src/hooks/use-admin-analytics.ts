import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export type AdminAnalyticsDto = {
  totalListings: number;
  liveListings: number;
  totalTransactions: number;
  totalDdRevenue: string;
  pendingKyc: number;
  pendingVerifications: number;
  usersByRole?: Record<string, number>;
  listingsByStatus?: Record<string, number>;
  recentTransactionsCount?: number;
};

export function useAdminAnalyticsQuery() {
  const { user, isReady } = useAuth();
  const isAdmin =
    user?.role === "admin" || user?.role === "staff" || user?.role === "super_admin";
  return useQuery({
    queryKey: ["admin", "analytics"],
    queryFn: () => apiRequest<AdminAnalyticsDto>("/admin/analytics").then((e) => e.data),
    enabled: isReady && isAdmin,
  });
}
