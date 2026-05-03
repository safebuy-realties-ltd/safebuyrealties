import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export type TaskDto = {
  id: string;
  listingId: string;
  assigneeId: string;
  createdById: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TasksMeMeta = { page: number; pageSize: number; total: number };

function tasksMeQueryString(opts?: { status?: string; page?: number; pageSize?: number }) {
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 50;
  const qs = new URLSearchParams();
  qs.set("page", String(page));
  qs.set("pageSize", String(pageSize));
  if (opts?.status) qs.set("status", opts.status);
  return `?${qs.toString()}`;
}

export function useMyTasksQuery(opts?: { status?: string; page?: number; pageSize?: number }) {
  const { user, isReady } = useAuth();
  const isProfessional = user?.role === "professional";
  const q = tasksMeQueryString(opts);
  return useQuery({
    queryKey: ["tasks", "me", opts?.status ?? null, opts?.page ?? 1, opts?.pageSize ?? 50],
    queryFn: () => apiRequest<TaskDto[]>(`/tasks/me${q}`),
    enabled: isReady && isProfessional,
    select: (envelope) => ({
      tasks: envelope.data,
      meta: envelope.meta as TasksMeMeta | undefined,
    }),
  });
}

export function usePatchTaskMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; body: { status?: string } }) =>
      apiRequest<TaskDto>(`/tasks/${args.id}`, {
        method: "PATCH",
        body: JSON.stringify(args.body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tasks", "me"] });
      void qc.invalidateQueries({ queryKey: ["listings"] });
    },
  });
}

export function useTaskKpiCounts() {
  const pending = useMyTasksQuery({ status: "PENDING", page: 1, pageSize: 1 });
  const inProgress = useMyTasksQuery({ status: "IN_PROGRESS", page: 1, pageSize: 1 });
  const completed = useMyTasksQuery({ status: "COMPLETED", page: 1, pageSize: 1 });

  return {
    pending: pending.data?.meta?.total ?? 0,
    inProgress: inProgress.data?.meta?.total ?? 0,
    completed: completed.data?.meta?.total ?? 0,
    isLoading: pending.isLoading || inProgress.isLoading || completed.isLoading,
  };
}
