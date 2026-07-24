import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { UserListItemDto } from "@/hooks/use-users";

export type CreateUserBody = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
  professionalType?: string;
  adminRoleId?: string;
};

export function useAdminUsersQuery(opts?: { role?: string; page?: number; pageSize?: number }) {
  const { user, isReady } = useAuth();
  const canReadUsers =
    user?.role === "super_admin" ||
    user?.role === "admin" ||
    user?.role === "staff" ||
    (user?.permissions?.includes("users.read") ?? false);
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 50;
  const qs = new URLSearchParams();
  qs.set("page", String(page));
  qs.set("pageSize", String(pageSize));
  if (opts?.role) qs.set("role", opts.role);
  return useQuery({
    queryKey: ["users", "admin", opts?.role ?? "all", page, pageSize],
    queryFn: () => apiRequest<UserListItemDto[]>(`/users?${qs.toString()}`),
    enabled: isReady && !!user && canReadUsers,
    select: (env) => ({
      users: env.data,
      meta: env.meta as { page: number; pageSize: number; total: number } | undefined,
    }),
  });
}

export function usePatchUserMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      id: string;
      body: {
        role?: string;
        professionalType?: string | null;
        isActive?: boolean;
        adminRoleId?: string | null;
      };
    }) =>
      apiRequest<UserListItemDto>(`/users/${args.id}`, {
        method: "PATCH",
        body: JSON.stringify(args.body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useCreateUserMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateUserBody) =>
      apiRequest<UserListItemDto>("/users", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}
