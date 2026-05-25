import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export type TaskDto = {
  id: string;
  reviewFeedback?: string[] | string | null;
  revisionStatus?: string | null;
  requiresDocumentEvidence?: boolean;
  completionNotes?: string | null;
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
    mutationFn: (args: {
      id: string;
      body: { status?: string; completionNotes?: string; checklist?: unknown; report?: unknown };
    }) =>
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

export function useMyTaskByIdQuery(taskId: string | null) {
  const { user, isReady } = useAuth();
  const isProfessional = user?.role === "professional";
  return useQuery({
    queryKey: ["tasks", "me", "detail", taskId],
    queryFn: () => apiRequest<TaskDto>(`/tasks/me/${taskId}`),
    enabled: isReady && isProfessional && !!taskId,
  });
}

export function useTaskKpiCounts() {
  const { user, isReady } = useAuth();
  const isProfessional = user?.role === "professional";

  return useQuery({
    queryKey: ["tasks", "me", "counts"],
    queryFn: async () => {
      const statuses = ["pending", "in_progress", "completed"];
      const counts = { pending: 0, inProgress: 0, completed: 0 };

      for (const status of statuses) {
        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const q = tasksMeQueryString({ status, page, pageSize: 100 });
          const result = await apiRequest<TaskDto[]>(`/tasks/me${q}`);
          const meta = result.meta as TasksMeMeta | undefined;

          if (status === "pending") counts.pending += result.data.length;
          else if (status === "in_progress") counts.inProgress += result.data.length;
          else if (status === "completed") counts.completed += result.data.length;

          hasMore = !!(meta && meta.page * meta.pageSize < meta.total);
          page++;
        }
      }

      return counts;
    },
    enabled: isReady && isProfessional,
  });
}

export function useCreateTaskMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      listingId: string;
      assigneeId: string;
      title: string;
      type: string;
      description: string;
    }) =>
      apiRequest<TaskDto>("/tasks", {
        method: "POST",
        body: JSON.stringify(args),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tasks", "me"] });
      void qc.invalidateQueries({ queryKey: ["tasks", "me", "counts"] });
    },
  });
}
