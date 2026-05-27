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
};

export function useAdminAnalyticsQuery() {
  const { user, isReady } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "staff";
  return useQuery({
    queryKey: ["admin", "analytics"],
    queryFn: () => apiRequest<AdminAnalyticsDto>("/admin/analytics").then((e) => e.data),
    enabled: isReady && isAdmin,
  });
}
