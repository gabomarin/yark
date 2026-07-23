# Overview Frontend Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the renderer UI around Mantine + CSS Modules, fully implement the new Overview/Servers experience, and move all non-Overview routes into consistent placeholders while preserving the current backend logic and IPC behavior.

**Architecture:** Keep `App.tsx` as orchestration/state and move presentation into a new shell, new overview feature components, and shared UI primitives. Use Mantine for layout and base controls, Phosphor for icons, and CSS Modules for local identity while shrinking the legacy global stylesheet to a minimal `globals.css`.

**Tech Stack:** React 18, TypeScript, Electron Vite, Mantine (`@mantine/core`, `@mantine/hooks`, `@mantine/notifications`), Emotion, Phosphor icons, CSS Modules, Vitest, React Testing Library, jsdom.

---

## File Structure

**Create:**
- `src/renderer/src/app/AppProviders.tsx` — Mount `MantineProvider`, notifications, and the shared theme.
- `src/renderer/src/app/AppShellLayout.tsx` — Shared app shell wrapper with sidebar + content region.
- `src/renderer/src/app/AppRouter.tsx` — Visual routing/composition layer driven by current state/actions from `App.tsx`.
- `src/renderer/src/shared/theme/tokens.ts` — Color, spacing, radius, shadow and typography tokens.
- `src/renderer/src/shared/theme/theme.ts` — Mantine theme object.
- `src/renderer/src/shared/ui/PlaceholderPage/PlaceholderPage.tsx` — Reusable placeholder surface for unimplemented routes.
- `src/renderer/src/shared/ui/PlaceholderPage/PlaceholderPage.module.css`
- `src/renderer/src/shared/ui/AppMetricCard/AppMetricCard.tsx` — Summary/metric card primitive.
- `src/renderer/src/shared/ui/AppMetricCard/AppMetricCard.module.css`
- `src/renderer/src/shared/ui/SearchField/SearchField.tsx`
- `src/renderer/src/shared/ui/SearchField/SearchField.module.css`
- `src/renderer/src/layout/Sidebar/Sidebar.tsx` — New sidebar implementation.
- `src/renderer/src/layout/Sidebar/Sidebar.module.css`
- `src/renderer/src/layout/PageScaffold/PageScaffold.tsx`
- `src/renderer/src/layout/PageScaffold/PageScaffold.module.css`
- `src/renderer/src/features/overview/OverviewPage.tsx`
- `src/renderer/src/features/overview/OverviewPage.module.css`
- `src/renderer/src/features/overview/components/OverviewHeader.tsx`
- `src/renderer/src/features/overview/components/OverviewStats.tsx`
- `src/renderer/src/features/overview/components/RecentActivityPanel.tsx`
- `src/renderer/src/features/overview/components/ServerGrid.tsx`
- `src/renderer/src/features/servers/components/ServerCard/ServerCard.tsx`
- `src/renderer/src/features/servers/components/ServerCard/ServerCard.module.css`
- `src/renderer/src/features/servers/components/ServerForm/ServerForm.tsx`
- `src/renderer/src/features/servers/components/ServerForm/ServerForm.module.css`
- `src/renderer/src/styles/globals.css` — Reset + base sizing + app background only.
- `src/renderer/src/test/setup.ts` — Testing-library setup.
- `src/renderer/src/app/AppShellLayout.test.tsx`
- `src/renderer/src/features/overview/OverviewPage.test.tsx`
- `src/renderer/src/features/servers/components/ServerCard/ServerCard.test.tsx`

**Modify:**
- `package.json` — Add Mantine and frontend test dependencies.
- `vitest.config.ts` — Enable jsdom and setup file for renderer tests.
- `src/renderer/src/main.tsx` — Replace old global stylesheet import and wrap app in providers.
- `src/renderer/src/App.tsx` — Convert from visual monolith to orchestration + router handoff.
- `src/renderer/src/env.d.ts` — Extend typings if test/globals import patterns require it.
- `src/renderer/src/styles.css` — Remove or drastically reduce after migration, or replace import target with `styles/globals.css`.
- `TODO.md` — Record the frontend rewrite progress when implementation is complete enough to change project status.

**Delete (after migration verifies cleanly):**
- `src/renderer/src/components/Sidebar.tsx`
- `src/renderer/src/components/ServerCard.tsx`
- `src/renderer/src/components/ServerForm.tsx`
- `src/renderer/src/styles.css` (only if `globals.css` fully replaces it and no route depends on it)

---

### Task 1: Add Mantine and renderer test foundations

**Files:**
- Modify: `package.json`
- Modify: `vitest.config.ts`
- Create: `src/renderer/src/test/setup.ts`

- [ ] **Step 1: Write the failing test configuration expectations**

Add these test files first so the workspace has concrete missing imports:

```ts
// src/renderer/src/test/setup.ts
import "@testing-library/jest-dom/vitest";
```

```ts
// src/renderer/src/app/AppShellLayout.test.tsx
import { describe, expect, it } from "vitest";

describe("test harness", () => {
  it("boots renderer test environment", () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cmd.exe /c "npx vitest run src/renderer/src/app/AppShellLayout.test.tsx"`
Expected: FAIL with missing `@testing-library/jest-dom/vitest` or config/setup resolution errors.

- [ ] **Step 3: Add dependencies and Vitest jsdom configuration**

Update `package.json` dependencies/devDependencies like this:

```json
{
  "dependencies": {
    "@mantine/core": "^7.17.0",
    "@mantine/hooks": "^7.17.0",
    "@mantine/notifications": "^7.17.0",
    "@emotion/react": "^11.14.0",
    "@phosphor-icons/react": "^2.1.10",
    "ini": "^5.0.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "jsdom": "^25.0.1"
  }
}
```

Update `vitest.config.ts` to include jsdom and setup:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "src/shared"),
      "@backend": path.resolve(__dirname, "src/backend"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: [path.resolve(__dirname, "src/renderer/src/test/setup.ts")],
  },
});
```

- [ ] **Step 4: Install dependencies and rerun the harness test**

Run: `cmd.exe /c "npm install"`
Run: `cmd.exe /c "npx vitest run src/renderer/src/app/AppShellLayout.test.tsx"`
Expected: PASS with `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/renderer/src/test/setup.ts src/renderer/src/app/AppShellLayout.test.tsx
git commit -m "chore: add mantine and renderer test foundation"
```

### Task 2: Add global providers and theme tokens

**Files:**
- Create: `src/renderer/src/shared/theme/tokens.ts`
- Create: `src/renderer/src/shared/theme/theme.ts`
- Create: `src/renderer/src/app/AppProviders.tsx`
- Modify: `src/renderer/src/main.tsx`
- Create: `src/renderer/src/styles/globals.css`

- [ ] **Step 1: Write the failing provider smoke test**

Replace the harness with a provider expectation:

```ts
// src/renderer/src/app/AppShellLayout.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppProviders } from "./AppProviders";

function Probe(): JSX.Element {
  return <div>provider-ready</div>;
}

describe("AppProviders", () => {
  it("renders children inside Mantine providers", () => {
    render(
      <AppProviders>
        <Probe />
      </AppProviders>,
    );
    expect(screen.getByText("provider-ready")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cmd.exe /c "npx vitest run src/renderer/src/app/AppShellLayout.test.tsx"`
Expected: FAIL with `Cannot find module './AppProviders'`.

- [ ] **Step 3: Implement theme tokens, theme, providers, and new globals import**

Create `tokens.ts`:

```ts
export const appTokens = {
  colors: {
    bg: "#0f141c",
    bgAccent: "#17202b",
    panel: "#1b2431",
    panelAlt: "#243245",
    border: "#32465e",
    text: "#f2f6fb",
    muted: "#9fb0c3",
    accent: "#55a6ff",
    ok: "#40d39f",
    warn: "#ffbe4d",
    bad: "#ff6c6c",
  },
  radius: {
    sm: 10,
    md: 14,
    lg: 18,
  },
  spacing: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 28,
  },
  shadows: {
    panel: "0 14px 34px rgba(0, 0, 0, 0.24)",
  },
} as const;
```

Create `theme.ts`:

```ts
import { createTheme } from "@mantine/core";
import { appTokens } from "./tokens";

export const appTheme = createTheme({
  primaryColor: "blue",
  primaryShade: 5,
  fontFamily: '"Segoe UI Variable", "Aptos", "Trebuchet MS", sans-serif',
  defaultRadius: "md",
  colors: {
    blue: [
      "#eef6ff",
      "#d9eaff",
      "#b7d7ff",
      "#8ec1ff",
      "#69acff",
      appTokens.colors.accent,
      "#3f8de0",
      "#2f6cab",
      "#1f4a75",
      "#10283f",
    ],
  },
  components: {
    AppShell: {
      defaultProps: {
        padding: 0,
      },
    },
    Card: {
      defaultProps: {
        radius: "lg",
      },
    },
  },
});
```

Create `AppProviders.tsx`:

```tsx
import type { PropsWithChildren } from "react";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { appTheme } from "@shared/theme/theme";

export function AppProviders({ children }: PropsWithChildren): JSX.Element {
  return (
    <MantineProvider theme={appTheme} defaultColorScheme="dark">
      <Notifications position="top-right" />
      {children}
    </MantineProvider>
  );
}
```

Create `globals.css`:

```css
html,
body,
#root {
  width: 100%;
  height: 100%;
  margin: 0;
}

* {
  box-sizing: border-box;
}

body {
  background:
    radial-gradient(circle at 8% 0%, rgba(85, 166, 255, 0.22), transparent 35%),
    radial-gradient(circle at 90% 0%, rgba(64, 211, 159, 0.12), transparent 38%),
    linear-gradient(180deg, #17202b, #0f141c);
  color: #f2f6fb;
  font-family: "Segoe UI Variable", "Aptos", "Trebuchet MS", sans-serif;
}
```

Update `main.tsx`:

```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AppProviders } from "./app/AppProviders";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./styles/globals.css";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("No se encontró el elemento root");
}

createRoot(container).render(
  <React.StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </React.StrictMode>,
);
```

- [ ] **Step 4: Run provider test**

Run: `cmd.exe /c "npx vitest run src/renderer/src/app/AppShellLayout.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/shared/theme/tokens.ts src/renderer/src/shared/theme/theme.ts src/renderer/src/app/AppProviders.tsx src/renderer/src/main.tsx src/renderer/src/styles/globals.css src/renderer/src/app/AppShellLayout.test.tsx
git commit -m "feat: add renderer theme and providers"
```

### Task 3: Build shell primitives and placeholder pages

**Files:**
- Create: `src/renderer/src/layout/PageScaffold/PageScaffold.tsx`
- Create: `src/renderer/src/layout/PageScaffold/PageScaffold.module.css`
- Create: `src/renderer/src/shared/ui/PlaceholderPage/PlaceholderPage.tsx`
- Create: `src/renderer/src/shared/ui/PlaceholderPage/PlaceholderPage.module.css`
- Create: `src/renderer/src/app/AppShellLayout.tsx`
- Create: `src/renderer/src/layout/Sidebar/Sidebar.tsx`
- Create: `src/renderer/src/layout/Sidebar/Sidebar.module.css`

- [ ] **Step 1: Write the failing shell test**

Expand `src/renderer/src/app/AppShellLayout.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "./AppProviders";
import { AppShellLayout } from "./AppShellLayout";

const onNavigate = vi.fn();

describe("AppShellLayout", () => {
  it("renders the sidebar and page content", () => {
    render(
      <AppProviders>
        <AppShellLayout
          route="overview"
          onNavigate={onNavigate}
          steamCmdDetected={false}
          steamCmdRunning={false}
          officialVersion={null}
          appVersion="0.1.0"
        >
          <div>page-body</div>
        </AppShellLayout>
      </AppProviders>,
    );

    expect(screen.getByText("ARK Server GBO")).toBeInTheDocument();
    expect(screen.getByText("page-body")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cmd.exe /c "npx vitest run src/renderer/src/app/AppShellLayout.test.tsx"`
Expected: FAIL with `Cannot find module './AppShellLayout'`.

- [ ] **Step 3: Implement shell layout, sidebar, scaffold, and placeholder page**

Create `PageScaffold.tsx`:

```tsx
import type { PropsWithChildren, ReactNode } from "react";
import { Stack } from "@mantine/core";
import classes from "./PageScaffold.module.css";

interface Props extends PropsWithChildren {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageScaffold({ title, subtitle, actions, children }: Props): JSX.Element {
  return (
    <Stack gap="lg" className={classes.page}>
      <header className={classes.header}>
        <div>
          <h1>{title}</h1>
          {subtitle !== undefined && <p>{subtitle}</p>}
        </div>
        {actions !== undefined && <div className={classes.actions}>{actions}</div>}
      </header>
      <div className={classes.body}>{children}</div>
    </Stack>
  );
}
```

Create `PlaceholderPage.tsx`:

```tsx
import { Card, Stack, Text, Title } from "@mantine/core";
import { PageScaffold } from "@layout/PageScaffold/PageScaffold";
import classes from "./PlaceholderPage.module.css";

interface Props {
  title: string;
  subtitle: string;
}

export function PlaceholderPage({ title, subtitle }: Props): JSX.Element {
  return (
    <PageScaffold title={title} subtitle={subtitle}>
      <Card className={classes.card} withBorder>
        <Stack gap="xs">
          <Title order={3}>Migración en progreso</Title>
          <Text c="dimmed">
            Esta pantalla todavía no fue reimplementada en el nuevo frontend. Su layout ya usa
            el nuevo shell compartido y se completará cuando llegue su diseño dedicado.
          </Text>
        </Stack>
      </Card>
    </PageScaffold>
  );
}
```

Create `AppShellLayout.tsx`:

```tsx
import type { PropsWithChildren } from "react";
import { AppShell } from "@mantine/core";
import { Sidebar, type Route } from "@layout/Sidebar/Sidebar";

interface Props extends PropsWithChildren {
  route: Route;
  onNavigate: (route: Route) => void;
  steamCmdDetected: boolean;
  steamCmdRunning: boolean;
  officialVersion: string | null;
  appVersion: string;
}

export function AppShellLayout({ children, ...sidebarProps }: Props): JSX.Element {
  return (
    <AppShell
      navbar={{ width: 248, breakpoint: "sm" }}
      padding={0}
      styles={{
        main: {
          minHeight: "100vh",
          background: "transparent",
        },
      }}
    >
      <AppShell.Navbar>
        <Sidebar {...sidebarProps} />
      </AppShell.Navbar>
      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
```

Create `Sidebar.tsx` using the same route union and labels now under the new path:

```tsx
import { Gear, FileText, FolderOpen, HardDrives, Circle, CloudArrowDown, ArrowsClockwise } from "@phosphor-icons/react";
import { Button, Stack, Text } from "@mantine/core";
import classes from "./Sidebar.module.css";

export type Route = "overview" | "clusters" | "backups" | "steamcmd" | "logs" | "settings";

const navItems: Array<{ id: Route; label: string; icon: typeof Circle }> = [
  { id: "overview", label: "Overview", icon: Circle },
  { id: "clusters", label: "Clusters", icon: Circle },
  { id: "backups", label: "Backups", icon: CloudArrowDown },
  { id: "steamcmd", label: "SteamCMD", icon: ArrowsClockwise },
  { id: "logs", label: "Logs", icon: FileText },
  { id: "settings", label: "Settings", icon: Gear },
];
```

Use `Stack`, `Button`, `Text`, and a local CSS Module to render brand, nav, SteamCMD state, official version chip and app version.

- [ ] **Step 4: Run shell test**

Run: `cmd.exe /c "npx vitest run src/renderer/src/app/AppShellLayout.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/layout/PageScaffold src/renderer/src/shared/ui/PlaceholderPage src/renderer/src/app/AppShellLayout.tsx src/renderer/src/layout/Sidebar src/renderer/src/app/AppShellLayout.test.tsx
git commit -m "feat: add shared app shell and placeholders"
```

### Task 4: Move App.tsx to orchestration + router handoff

**Files:**
- Create: `src/renderer/src/app/AppRouter.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Write the failing router smoke test**

Create `src/renderer/src/features/overview/OverviewPage.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { AppRouter } from "@app/AppRouter";

const noop = vi.fn();

describe("AppRouter", () => {
  it("shows placeholder pages for non-overview routes", () => {
    render(
      <AppProviders>
        <AppRouter
          route="logs"
          appVersion="0.1.0"
          officialVersion={null}
          steamCmdDetected={false}
          steamCmdRunning={false}
          onNavigate={noop}
          overview={null}
        />
      </AppProviders>,
    );

    expect(screen.getByText("Logs")).toBeInTheDocument();
    expect(screen.getByText(/Migración en progreso/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cmd.exe /c "npx vitest run src/renderer/src/features/overview/OverviewPage.test.tsx"`
Expected: FAIL with `Cannot find module '@app/AppRouter'`.

- [ ] **Step 3: Implement AppRouter and slim App.tsx**

Create `AppRouter.tsx` with props like:

```tsx
import { AppShellLayout } from "./AppShellLayout";
import { PlaceholderPage } from "@shared/ui/PlaceholderPage/PlaceholderPage";
import type { Route } from "@layout/Sidebar/Sidebar";
import type { ReactNode } from "react";

interface OverviewSlot {
  page: ReactNode;
}

interface Props {
  route: Route;
  appVersion: string;
  officialVersion: string | null;
  steamCmdDetected: boolean;
  steamCmdRunning: boolean;
  onNavigate: (route: Route) => void;
  overview: OverviewSlot | null;
}
```

Switch inside `AppRouter`:

```tsx
const content = (() => {
  switch (route) {
    case "overview":
      return overview?.page ?? null;
    case "clusters":
      return <PlaceholderPage title="Clusters" subtitle="Compatibilidad y transferencias entre mapas" />;
    case "backups":
      return <PlaceholderPage title="Backups" subtitle="Historial y restauración de respaldos" />;
    case "steamcmd":
      return <PlaceholderPage title="SteamCMD" subtitle="Estado de instalación, consola y operaciones" />;
    case "logs":
      return <PlaceholderPage title="Logs" subtitle="Eventos, runtime, updates y backups por servidor" />;
    case "settings":
      return <PlaceholderPage title="Settings" subtitle="Configuración general de la aplicación" />;
  }
})();
```

Refactor `App.tsx` to stop returning big page JSX directly. Keep all current data fetching and action callbacks, but replace the `renderMain` switch with:

```tsx
return (
  <AppRouter
    route={route}
    appVersion={APP_VERSION}
    officialVersion={officialVersion}
    steamCmdDetected={steamCmdStatus?.detected === true}
    steamCmdRunning={steamCmdStatus?.running === true}
    onNavigate={navigate}
    overview={{ page: <div>overview-pending</div> }}
  />
);
```

Use a temporary overview stub in this task; the real overview arrives in later tasks.

- [ ] **Step 4: Run router smoke test**

Run: `cmd.exe /c "npx vitest run src/renderer/src/features/overview/OverviewPage.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/app/AppRouter.tsx src/renderer/src/App.tsx src/renderer/src/features/overview/OverviewPage.test.tsx
git commit -m "refactor: move renderer into shell router composition"
```

### Task 5: Build shared Overview primitives

**Files:**
- Create: `src/renderer/src/shared/ui/AppMetricCard/AppMetricCard.tsx`
- Create: `src/renderer/src/shared/ui/AppMetricCard/AppMetricCard.module.css`
- Create: `src/renderer/src/shared/ui/SearchField/SearchField.tsx`
- Create: `src/renderer/src/shared/ui/SearchField/SearchField.module.css`
- Create: `src/renderer/src/features/overview/components/OverviewHeader.tsx`
- Create: `src/renderer/src/features/overview/components/OverviewStats.tsx`
- Create: `src/renderer/src/features/overview/components/RecentActivityPanel.tsx`

- [ ] **Step 1: Write the failing Overview component test**

Replace `OverviewPage.test.tsx` with:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { OverviewPage } from "./OverviewPage";

const server = {
  id: "srv-1",
  name: "The Island",
  map: "TheIsland_WP",
  installDir: "C:/ARK/TheIsland",
  clusterId: null,
  clusterDir: null,
  adminPassword: "admin",
  serverPassword: "",
  gamePort: 7777,
  queryPort: 27015,
  rconPort: 27020,
  launchArgs: "",
};

describe("OverviewPage", () => {
  it("renders page header, stats, server list and recent activity", () => {
    render(
      <AppProviders>
        <OverviewPage
          search=""
          onSearchChange={vi.fn()}
          onCreateServer={vi.fn()}
          servers={[server]}
          filteredServers={[server]}
          runningServers={0}
          okClusters={0}
          warningsCount={0}
          updatesAvailableCount={0}
          reports={[]}
          statuses={new Map()}
          installationInfo={new Map()}
          events={[]}
          onEditServer={vi.fn()}
          onOpenIni={vi.fn()}
          onOpenLogs={vi.fn()}
          onStartServer={vi.fn()}
          onStopServer={vi.fn()}
          onRestartServer={vi.fn()}
          onKillServer={vi.fn()}
          onOpenFolder={vi.fn()}
          onInstallFiles={vi.fn()}
          onUpdateNow={vi.fn()}
          onCloneServer={vi.fn()}
          onDeleteServer={vi.fn()}
          onSendRcon={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Servidores")).toBeInTheDocument();
    expect(screen.getByText("Actividad reciente")).toBeInTheDocument();
    expect(screen.getByText("The Island")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cmd.exe /c "npx vitest run src/renderer/src/features/overview/OverviewPage.test.tsx"`
Expected: FAIL with `Cannot find module './OverviewPage'`.

- [ ] **Step 3: Implement Overview shared primitives**

Create `AppMetricCard.tsx`:

```tsx
import type { ReactNode } from "react";
import { Card, Stack, Text, Title } from "@mantine/core";
import classes from "./AppMetricCard.module.css";

interface Props {
  icon?: ReactNode;
  label: string;
  value: string | number;
  hint?: string;
  disabled?: boolean;
}

export function AppMetricCard({ icon, label, value, hint, disabled = false }: Props): JSX.Element {
  return (
    <Card className={classes.card} data-disabled={disabled || undefined} withBorder>
      <Stack gap={4}>
        <Text className={classes.label}>{icon}{label}</Text>
        <Title order={3} className={classes.value}>{value}</Title>
        {hint !== undefined && <Text className={classes.hint}>{hint}</Text>}
      </Stack>
    </Card>
  );
}
```

Create `SearchField.tsx` using Mantine `TextInput` + `MagnifyingGlass` icon.

Create `OverviewHeader.tsx` using `PageScaffold` actions slot.

Create `OverviewStats.tsx` with props:

```ts
interface Props {
  totalServers: number;
  runningServers: number;
  okClusters: number;
  totalClusters: number;
  updatesAvailableCount: number;
  warningsCount: number;
}
```

Create `RecentActivityPanel.tsx` with a card surface and a min-height constraint in the module CSS.

- [ ] **Step 4: Run test again**

Run: `cmd.exe /c "npx vitest run src/renderer/src/features/overview/OverviewPage.test.tsx"`
Expected: still FAIL because `OverviewPage` is not yet implemented, but primitive imports should now resolve.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/shared/ui/AppMetricCard src/renderer/src/shared/ui/SearchField src/renderer/src/features/overview/components
git commit -m "feat: add overview shared ui primitives"
```

### Task 6: Implement the new ServerCard

**Files:**
- Create: `src/renderer/src/features/servers/components/ServerCard/ServerCard.tsx`
- Create: `src/renderer/src/features/servers/components/ServerCard/ServerCard.module.css`
- Create: `src/renderer/src/features/servers/components/ServerCard/ServerCard.test.tsx`

- [ ] **Step 1: Write the failing ServerCard test**

Create `ServerCard.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { ServerCard } from "./ServerCard";

const profile = {
  id: "srv-1",
  name: "The Island",
  map: "TheIsland_WP",
  installDir: "C:/ARK/TheIsland",
  clusterId: null,
  clusterDir: null,
  adminPassword: "admin",
  serverPassword: "",
  gamePort: 7777,
  queryPort: 27015,
  rconPort: 27020,
  launchArgs: "",
};

describe("ServerCard", () => {
  it("exposes main actions", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();

    render(
      <AppProviders>
        <ServerCard
          server={profile}
          runtime={null}
          installation={null}
          onStart={onStart}
          onStop={vi.fn()}
          onRestart={vi.fn()}
          onOpenFolder={vi.fn()}
          onOpenLogs={vi.fn()}
          onOpenIni={vi.fn()}
          onInstallFiles={vi.fn()}
          onUpdateNow={vi.fn()}
          onClone={vi.fn()}
          onKill={vi.fn()}
          onDelete={vi.fn()}
          onEdit={vi.fn()}
          onRcon={vi.fn()}
          onCancelSteamCmd={vi.fn()}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole("button", { name: /iniciar/i }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cmd.exe /c "npx vitest run src/renderer/src/features/servers/components/ServerCard/ServerCard.test.tsx"`
Expected: FAIL with missing module.

- [ ] **Step 3: Implement the new ServerCard**

Use Mantine primitives:

```tsx
import { DotsThreeVertical, FolderOpen, Gear, NotePencil, Play, Power, TerminalWindow, WarningCircle, Wrench } from "@phosphor-icons/react";
import { ActionIcon, Badge, Card, Group, Menu, Stack, Text, Title } from "@mantine/core";
```

Required visible structure:

- Header with server name + status badge.
- Meta grid for map / cluster / version / install status.
- Compact action row with main controls.
- Overflow menu for less common actions.

Required labels/actions to preserve:

- `Iniciar`
- `Detener`
- `Reiniciar`
- `Abrir carpeta`
- `Logs`
- `INI`
- `Instalar archivos`
- `Actualizar`
- `Clonar`
- `Forzar cierre`
- `Eliminar`
- `Editar`

Support optional derived text using `runtime` and `installation` data, but keep the first implementation minimal and reliable.

- [ ] **Step 4: Run ServerCard test**

Run: `cmd.exe /c "npx vitest run src/renderer/src/features/servers/components/ServerCard/ServerCard.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/features/servers/components/ServerCard
git commit -m "feat: rewrite server card with mantine"
```

### Task 7: Implement Overview page composition

**Files:**
- Create: `src/renderer/src/features/overview/OverviewPage.tsx`
- Create: `src/renderer/src/features/overview/OverviewPage.module.css`
- Create: `src/renderer/src/features/overview/components/ServerGrid.tsx`
- Modify: `src/renderer/src/features/overview/OverviewPage.test.tsx`
- Modify: `src/renderer/src/app/AppRouter.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Run the existing Overview test and confirm it still fails**

Run: `cmd.exe /c "npx vitest run src/renderer/src/features/overview/OverviewPage.test.tsx"`
Expected: FAIL because `OverviewPage` is still missing.

- [ ] **Step 2: Implement OverviewPage and ServerGrid**

Create `ServerGrid.tsx` with props for filtered servers, supporting maps, empty states, and all server action handlers.

Create `OverviewPage.tsx` with props matching the current renderer orchestration data:

```ts
import type {
  AppEvent,
  ClusterComplianceReport,
  ServerInstallationInfo,
  ServerProfile,
  ServerRuntimeInfo,
} from "@shared/types";

interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  onCreateServer: () => void;
  servers: ServerProfile[];
  filteredServers: ServerProfile[];
  runningServers: number;
  okClusters: number;
  warningsCount: number;
  updatesAvailableCount: number;
  reports: ClusterComplianceReport[];
  statuses: Map<string, ServerRuntimeInfo>;
  installationInfo: Map<string, ServerInstallationInfo>;
  events: AppEvent[];
  onEditServer: (server: ServerProfile) => void;
  onOpenIni: (server: ServerProfile) => void;
  onOpenLogs: (serverId: string) => void;
  onStartServer: (serverId: string) => void;
  onStopServer: (serverId: string) => void;
  onRestartServer: (serverId: string) => void;
  onKillServer: (serverId: string) => void;
  onOpenFolder: (serverId: string) => void;
  onInstallFiles: (serverId: string) => void;
  onUpdateNow: (serverId: string) => void;
  onCloneServer: (serverId: string) => void;
  onDeleteServer: (serverId: string) => void;
  onSendRcon: (serverId: string, command: string) => void;
  onCancelSteamCmd: () => void;
}
```

Use `OverviewHeader`, `OverviewStats`, `ServerGrid`, and `RecentActivityPanel` in a composed layout.

Update `AppRouter.tsx` so overview route renders the passed `overview.page`.

Update `App.tsx` so the overview slot becomes:

```tsx
<OverviewPage
  search={search}
  onSearchChange={setSearch}
  onCreateServer={() => setOverlay({ kind: "create" })}
  servers={servers}
  filteredServers={filteredServers}
  runningServers={runningServers}
  okClusters={okClusters}
  warningsCount={warningsCount}
  updatesAvailableCount={updatesAvailableCount}
  reports={reports}
  statuses={statuses}
  installationInfo={installationInfo}
  events={events}
  onEditServer={(server) => setOverlay({ kind: "edit", profile: server })}
  onOpenIni={(server) => setOverlay({ kind: "ini", profile: server })}
  onOpenLogs={(serverId) => openLogsForServer(serverId, "events")}
  onStartServer={(id) => void runAction(() => window.api.startServer(id))}
  onStopServer={(id) => void runAction(() => window.api.stopServer(id))}
  onRestartServer={(id) => void restartServer(id)}
  onKillServer={(id) => void runAction(() => window.api.killServer(id))}
  onOpenFolder={(id) => void runAction(() => window.api.openServerFolder(id))}
  onInstallFiles={(id) => void runAction(() => window.api.installServerFiles(id))}
  onUpdateNow={(id) => void runAction(() => window.api.updateServerNow(id))}
  onCloneServer={(id) => void runAction(() => window.api.cloneServer(id))}
  onDeleteServer={(id) => {
    if (window.confirm(`¿Eliminar el servidor?`)) {
      void runAction(() => window.api.deleteServer(id));
    }
  }}
  onSendRcon={(id, command) => void runAction(() => window.api.sendRconCommand(id, command))}
  onCancelSteamCmd={() => void runAction(() => window.api.cancelSteamCmd())}
/>
```

- [ ] **Step 3: Run Overview test**

Run: `cmd.exe /c "npx vitest run src/renderer/src/features/overview/OverviewPage.test.tsx"`
Expected: PASS.

- [ ] **Step 4: Run shell test + ServerCard test**

Run: `cmd.exe /c "npx vitest run src/renderer/src/app/AppShellLayout.test.tsx src/renderer/src/features/servers/components/ServerCard/ServerCard.test.tsx src/renderer/src/features/overview/OverviewPage.test.tsx"`
Expected: PASS with all three files green.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/features/overview src/renderer/src/app/AppRouter.tsx src/renderer/src/App.tsx
git commit -m "feat: implement new overview page"
```

### Task 8: Rewrite ServerForm for first-cut operability

**Files:**
- Create: `src/renderer/src/features/servers/components/ServerForm/ServerForm.tsx`
- Create: `src/renderer/src/features/servers/components/ServerForm/ServerForm.module.css`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Write the failing form smoke test**

Add to `OverviewPage.test.tsx` or create `ServerForm.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@app/AppProviders";
import { ServerForm } from "./ServerForm";

describe("ServerForm", () => {
  it("renders the main fields", () => {
    render(
      <AppProviders>
        <ServerForm initial={null} onCancel={vi.fn()} onSaved={vi.fn()} />
      </AppProviders>,
    );

    expect(screen.getByLabelText(/nombre/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mapa/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cmd.exe /c "npx vitest run src/renderer/src/features/servers/components/ServerForm/ServerForm.test.tsx"`
Expected: FAIL because the new form component does not exist.

- [ ] **Step 3: Implement the new ServerForm using current logic contract**

Use Mantine `Modal` or page-surface composition, but preserve the current props contract:

```ts
interface Props {
  initial: ServerProfile | null;
  onCancel: () => void;
  onSaved: () => void;
}
```

Preserve functional behavior by reusing the current create/update flow:

- Load existing values if `initial` is not null.
- Validate minimal required fields client-side.
- Submit with `window.api.createServer` or `window.api.updateServer`.
- Surface error messages clearly.
- Keep the component self-contained and styled with CSS Modules.

Update `App.tsx` overlay branch to use the new import path.

- [ ] **Step 4: Run form test**

Run: `cmd.exe /c "npx vitest run src/renderer/src/features/servers/components/ServerForm/ServerForm.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/features/servers/components/ServerForm src/renderer/src/App.tsx
git commit -m "feat: rewrite server form with mantine"
```

### Task 9: Remove migrated legacy styles and obsolete components

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/main.tsx`
- Modify or Delete: `src/renderer/src/styles.css`
- Delete: `src/renderer/src/components/Sidebar.tsx`
- Delete: `src/renderer/src/components/ServerCard.tsx`
- Delete: `src/renderer/src/components/ServerForm.tsx`
- Modify: `TODO.md`

- [ ] **Step 1: Search for remaining imports from the old migrated components**

Run: `cmd.exe /c "rg \"components/(Sidebar|ServerCard|ServerForm)\" src/renderer/src"`
Expected: Shows remaining references, if any.

- [ ] **Step 2: Remove the remaining legacy dependencies**

Clean `App.tsx` imports so only these legacy components remain if still intentionally deferred:

```tsx
import { IniEditor } from "./components/IniEditor";
import { LogsViewer } from "./components/LogsViewer";
```

Delete legacy files only after the search in Step 1 returns no references to them.

Reduce the old stylesheet to zero references on the migrated Overview path. If no route still imports it, delete `src/renderer/src/styles.css`. If deferred routes still need it, keep it temporarily but remove any migrated-surface dependency.

Update `TODO.md` to reflect:

- Frontend rewrite base started.
- Overview migrated to new Mantine + CSS Modules architecture.
- Non-overview pages currently served as placeholders in the new shell.

- [ ] **Step 3: Run typecheck**

Run: `cmd.exe /c "npm run typecheck"`
Expected: PASS.

- [ ] **Step 4: Run build and tests**

Run: `cmd.exe /c "npm run build"`
Expected: PASS.

Run: `cmd.exe /c "npm test"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/main.tsx src/renderer/src/styles/globals.css TODO.md
git rm src/renderer/src/components/Sidebar.tsx src/renderer/src/components/ServerCard.tsx src/renderer/src/components/ServerForm.tsx
# Also remove src/renderer/src/styles.css if fully unused
git commit -m "refactor: remove legacy overview frontend"
```

## Self-Review

### Spec coverage

- Mantine + CSS Modules architecture: covered by Tasks 1-3.
- New shell preserving sidebar concept: covered by Tasks 3-4.
- Overview implemented as the first real page: covered by Tasks 5-7.
- Server card rewritten: covered by Task 6.
- Server form included in first cut: covered by Task 8.
- Non-overview pages converted to homogeneous placeholders: covered by Tasks 3-4.
- Shrinking/removing monolithic stylesheet: covered by Task 9.
- Validation via typecheck, build, tests: covered by Task 9.

No spec gaps remain.

### Placeholder scan

- No `TODO`, `TBD`, or “implement later” placeholders remain in executable steps.
- Deferred areas are explicitly out of scope rather than hidden in incomplete tasks.

### Type consistency

- `Route` type is centralized under the new sidebar path.
- `OverviewPage` props mirror the existing orchestration data and action handlers.
- `ServerForm` preserves the existing public contract (`initial`, `onCancel`, `onSaved`).
- `ServerCard` preserves the existing operational action surface.
