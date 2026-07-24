import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy staff portal — redirected into the unified admin backend. */
export const Route = createFileRoute("/dashboard/staff")({
  beforeLoad: ({ location }) => {
    const suffix = location.pathname.replace(/^\/dashboard\/staff/, "") || "/";
    const target = `/dashboard/admin${suffix === "/" ? "" : suffix}`;
    throw redirect({
      to: target,
      search: location.search as Record<string, string>,
      replace: true,
    });
  },
});
