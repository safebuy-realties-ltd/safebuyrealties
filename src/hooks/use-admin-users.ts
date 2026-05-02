import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { UserListItemDto } from "@/hooks/use-users";

export function useAdminUsersQuery(opts?: { role?: string; page?: number; pageSize?: number }) {
  const { user, isReady } = useAuth();
  const isAdmin = user?.role === "admin";
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 50;
  const qs = new URLSearchParams();
  qs.set("page", String(page));
  qs.set("pageSize", String(pageSize));
  if (opts?.role) qs.set("role", opts.role);
  return useQuery({
    queryKey: ["users", "admin", opts?.role ?? "all", page, pageSize],
    queryFn: () => apiRequest<UserListItemDto[]>(`/users?${qs.toString()}`),
    enabled: isReady && isAdmin,
    select: (env) => ({
      users: env.data,
      meta: env.meta as { page: number; pageSize: number; total: number } | undefined,
    }),
  });
}

export function usePatchUserMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; body: { role?: string; professionalType?: string | null } }) =>
      apiRequest<UserListItemDto>(`/users/${args.id}`, {
        method: "PATCH",
        body: JSON.stringify(args.body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}
