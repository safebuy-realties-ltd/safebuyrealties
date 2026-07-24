import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

export type AdminRoleDto = {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  sortOrder: number;
  userCount?: number;
  updatedAt: string;
};

export type PrivilegeCatalogItem = {
  code: string;
  label: string;
  unlocks: string[];
};

export function usePrivilegeCatalogQuery() {
  return useQuery({
    queryKey: ["admin-roles", "privileges"],
    queryFn: async () => {
      const res = await apiRequest<PrivilegeCatalogItem[]>("/admin/roles/privileges");
      return res.data;
    },
  });
}

export function useAdminRolesQuery(enabled = true) {
  return useQuery({
    queryKey: ["admin-roles"],
    enabled,
    queryFn: async () => {
      const res = await apiRequest<AdminRoleDto[]>("/admin/roles");
      return res.data;
    },
  });
}

export function useCreateAdminRoleMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; description?: string; permissions: string[] }) =>
      apiRequest<AdminRoleDto>("/admin/roles", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-roles"] });
    },
  });
}

export function useUpdateAdminRoleMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: { name?: string; description?: string | null; permissions?: string[] };
    }) =>
      apiRequest<AdminRoleDto>(`/admin/roles/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-roles"] });
    },
  });
}

export function useDeleteAdminRoleMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ id: string }>(`/admin/roles/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-roles"] });
    },
  });
}
