import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export type NotificationDto = {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  entityId: string | null;
  entityType: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationsMeta = {
  page: number;
  pageSize: number;
  total: number;
  unreadCount: number;
};

function notificationsQueryString(opts?: { page?: number; pageSize?: number }) {
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 10;
  const qs = new URLSearchParams();
  qs.set("page", String(page));
  qs.set("pageSize", String(pageSize));
  return `?${qs.toString()}`;
}

export function useNotificationsQuery(opts?: { page?: number; pageSize?: number }) {
  const { isReady, isAuthenticated } = useAuth();
  const q = notificationsQueryString(opts);

  return useQuery({
    queryKey: ["notifications", "me", opts?.page ?? 1, opts?.pageSize ?? 10],
    queryFn: () => apiRequest<NotificationDto[]>(`/notifications/me${q}`),
    enabled: isReady && isAuthenticated,
    refetchOnWindowFocus: true,
    select: (envelope) => ({
      notifications: envelope.data,
      meta: envelope.meta as NotificationsMeta | undefined,
    }),
  });
}

export function useMarkNotificationReadMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) =>
      apiRequest<NotificationDto>(`/notifications/${notificationId}/read`, {
        method: "PATCH",
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notifications", "me"] });
    },
  });
}

export function useMarkAllNotificationsReadMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<{ updated: boolean }>("/notifications/read-all", {
        method: "PATCH",
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notifications", "me"] });
    },
  });
}
