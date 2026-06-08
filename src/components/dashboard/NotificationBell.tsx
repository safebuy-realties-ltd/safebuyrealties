import { useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { notificationEntityTarget } from "@/lib/notification-routes";
import {
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
  useNotificationsQuery,
  type NotificationDto,
} from "@/hooks/use-notifications";

function NotificationRow({
  notification,
  onSelect,
}: {
  notification: NotificationDto;
  onSelect: (notification: NotificationDto) => void;
}) {
  const unread = !notification.readAt;

  return (
    <DropdownMenuItem
      className="flex cursor-pointer flex-col items-start gap-1 whitespace-normal py-3"
      onClick={() => onSelect(notification)}
    >
      <div className="flex w-full items-start gap-2">
        {unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
        <div className={unread ? "min-w-0 flex-1" : "min-w-0 flex-1 pl-4"}>
          <p className="text-sm font-medium leading-snug text-foreground">{notification.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {notification.body}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground/80">
            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
          </p>
        </div>
      </div>
    </DropdownMenuItem>
  );
}

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading } = useNotificationsQuery({ page: 1, pageSize: 10 });
  const markRead = useMarkNotificationReadMutation();
  const markAllRead = useMarkAllNotificationsReadMutation();

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.meta?.unreadCount ?? 0;

  const handleSelect = (notification: NotificationDto) => {
    if (!notification.readAt) {
      markRead.mutate(notification.id);
    }
    if (!user) return;

    const target = notificationEntityTarget(
      user.role,
      notification.entityType,
      notification.entityId,
    );
    if (target) {
      navigate({ to: target.to, search: target.search });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              disabled={markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
            >
              Mark all read
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        {isLoading && (
          <p className="px-3 py-4 text-sm text-muted-foreground">Loading notifications…</p>
        )}
        {!isLoading && notifications.length === 0 && (
          <p className="px-3 py-4 text-sm text-muted-foreground">No notifications yet.</p>
        )}
        {!isLoading &&
          notifications.map((notification) => (
            <NotificationRow
              key={notification.id}
              notification={notification}
              onSelect={handleSelect}
            />
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
