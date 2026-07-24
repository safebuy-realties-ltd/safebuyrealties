import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { DdScheduleDefinition } from "@/lib/dd-schedule-checklists";

export type DdChecklistItemDto = {
  id: string;
  code: string;
  label: string;
  description: string | null;
  sortOrder: number;
  active: boolean;
};

export type DdScheduleDto = {
  id: string;
  code: string;
  letter: string;
  name: string;
  shortName: string;
  description: string;
  suggestedProfessionalTypes: string[];
  sortOrder: number;
  active: boolean;
  updatedAt: string;
  items: DdChecklistItemDto[];
};

export function toScheduleDefinitions(schedules: DdScheduleDto[]): DdScheduleDefinition[] {
  return schedules.map((s) => ({
    code: s.code as DdScheduleDefinition["code"],
    letter: s.letter as DdScheduleDefinition["letter"],
    name: s.name,
    shortName: s.shortName,
    description: s.description,
    suggestedProfessionalTypes: s.suggestedProfessionalTypes,
    items: s.items.map((item) => ({
      code: item.code,
      label: item.label,
      description: item.description ?? undefined,
    })),
  }));
}

export function usePublicDdChecklistsQuery() {
  return useQuery({
    queryKey: ["dd-checklists", "public"],
    queryFn: () => apiRequest<DdScheduleDto[]>("/dd-checklists"),
    select: (env) => env.data,
    staleTime: 60_000,
  });
}

export function useAdminDdChecklistsQuery() {
  const { user, isReady } = useAuth();
  const allowed = user?.role === "admin" || user?.role === "super_admin" || user?.role === "staff";
  return useQuery({
    queryKey: ["dd-checklists", "admin"],
    queryFn: () => apiRequest<DdScheduleDto[]>("/admin/dd-checklists"),
    select: (env) => env.data,
    enabled: isReady && allowed,
  });
}

export type CreateScheduleBody = {
  code: string;
  letter: string;
  name: string;
  shortName: string;
  description: string;
  suggestedProfessionalTypes?: string[];
  sortOrder?: number;
  active?: boolean;
};

export type UpdateScheduleBody = Partial<Omit<CreateScheduleBody, "code"> & { active: boolean }>;

export type CreateItemBody = {
  code: string;
  label: string;
  description?: string;
  sortOrder?: number;
  active?: boolean;
};

export type UpdateItemBody = {
  label?: string;
  description?: string | null;
  sortOrder?: number;
  active?: boolean;
};

function invalidateDdChecklists(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["dd-checklists"] });
}

export function useCreateDdScheduleMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateScheduleBody) =>
      apiRequest<DdScheduleDto>("/admin/dd-checklists/schedules", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => invalidateDdChecklists(qc),
  });
}

export function useUpdateDdScheduleMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; body: UpdateScheduleBody }) =>
      apiRequest<DdScheduleDto>(`/admin/dd-checklists/schedules/${args.id}`, {
        method: "PATCH",
        body: JSON.stringify(args.body),
      }),
    onSuccess: () => invalidateDdChecklists(qc),
  });
}

export function useCreateDdItemMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { scheduleId: string; body: CreateItemBody }) =>
      apiRequest<DdChecklistItemDto>(`/admin/dd-checklists/schedules/${args.scheduleId}/items`, {
        method: "POST",
        body: JSON.stringify(args.body),
      }),
    onSuccess: () => invalidateDdChecklists(qc),
  });
}

export function useUpdateDdItemMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { itemId: string; body: UpdateItemBody }) =>
      apiRequest<DdChecklistItemDto>(`/admin/dd-checklists/items/${args.itemId}`, {
        method: "PATCH",
        body: JSON.stringify(args.body),
      }),
    onSuccess: () => invalidateDdChecklists(qc),
  });
}

export function useReorderDdItemsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { scheduleId: string; orderedIds: string[] }) =>
      apiRequest<DdScheduleDto[]>(`/admin/dd-checklists/schedules/${args.scheduleId}/reorder`, {
        method: "POST",
        body: JSON.stringify({ orderedIds: args.orderedIds }),
      }),
    onSuccess: () => invalidateDdChecklists(qc),
  });
}
