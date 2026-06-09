import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export type UserListItemDto = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  name: string;
  role: string;
  professionalType: string | null;
  phone: string | null;
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
};

export function useProfessionalsQuery() {
  const { user, isReady } = useAuth();
  const canList =
    user?.role === "staff" || user?.role === "admin" || user?.role === "super_admin";
  return useQuery({
    queryKey: ["users", "PROFESSIONAL"],
    queryFn: () => apiRequest<UserListItemDto[]>(`/users?role=PROFESSIONAL&pageSize=100`),
    enabled: isReady && canList,
    select: (envelope) => ({
      users: envelope.data,
      meta: envelope.meta as { page: number; pageSize: number; total: number } | undefined,
    }),
  });
}
