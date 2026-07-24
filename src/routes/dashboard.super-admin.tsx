import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy super-admin portal — redirected into the unified admin backend. */
export const Route = createFileRoute("/dashboard/super-admin")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/admin", replace: true });
  },
});
