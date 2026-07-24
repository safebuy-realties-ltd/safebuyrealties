import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { canManageUserPermissions } from "@/lib/permissions";

export type PermissionCatalogEntry = { code: string };

export type UserPermissionsDto = {
  userId: string;
  role: string;
  custom: boolean;
  grants: string[];
  effective: string[];
};

export function usePermissionsCatalogQuery(enabled = true) {
  return useQuery({
    queryKey: ["admin-permissions", "catalog"],
    queryFn: () => apiRequest<PermissionCatalogEntry[]>("/admin/permissions/catalog"),
    select: (env) => env.data,
    enabled,
  });
}

export function useUserPermissionsQuery(userId: string | null, enabled = true) {
  const { user, isReady } = useAuth();
  const canManage = canManageUserPermissions(user?.role, user?.permissions);
  return useQuery({
    queryKey: ["admin-permissions", "user", userId],
    queryFn: () =>
      apiRequest<UserPermissionsDto>(`/admin/permissions/users/${userId}`),
    select: (env) => env.data,
    enabled: isReady && canManage && enabled && !!userId,
  });
}

export function useSetUserPermissionsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { userId: string; permissions: string[] }) =>
      apiRequest<UserPermissionsDto>(`/admin/permissions/users/${args.userId}`, {
        method: "PUT",
        body: JSON.stringify({ permissions: args.permissions }),
      }),
    onSuccess: (_env, vars) => {
      void qc.invalidateQueries({ queryKey: ["admin-permissions", "user", vars.userId] });
    },
  });
}
