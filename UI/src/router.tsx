import {
  Outlet,
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { BenchProvider } from "./context/BenchContext";
import { IndexPage } from "./pages/IndexPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PumpPage } from "./pages/PumpPage";
import { SettingsPage } from "./pages/SettingsPage";

const rootRoute = createRootRoute({
  component: function RootLayout() {
    return (
      <BenchProvider>
        <Outlet />
      </BenchProvider>
    );
  },
  notFoundComponent: NotFoundPage,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: IndexPage,
});

const pumpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/bomba/$id",
  component: PumpPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/configuracoes",
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([indexRoute, pumpRoute, settingsRoute]);

const history = createHashHistory();

export const router = createRouter({ routeTree, history });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
