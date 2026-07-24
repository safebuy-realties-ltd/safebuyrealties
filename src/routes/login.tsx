import { Outlet, createFileRoute } from "@tanstack/react-router";

type LoginSearch = {
  redirect?: string;
};

/** Layout for `/login` and portal children (`/login/buyer`, etc.). */
export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: () => <Outlet />,
});
