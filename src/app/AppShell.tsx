import { Badge, Button } from "@astryxdesign/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigationType } from "react-router-dom";
import { Brand } from "../components/Brand";
import { FunctionIcon, type FunctionIconName } from "../components/FunctionIcon";
import { api } from "../lib/api/client";
import type { HealthResponse } from "../lib/api/types";
import { useMediaQuery } from "../lib/useMediaQuery";
import {
  HUB_LATENCY_POLL_MS,
  formatHubLatencyLabel,
  hubLatencyAccessibleName,
  roundLatencyMs,
} from "../lib/hubLatency";
import { useAuth } from "./auth/AuthContext";
import { useThemePreference, type ThemePreference } from "./providers";

interface NavItem { label: string; path: string; icon: FunctionIconName; end?: boolean; }
interface NavGroup { label: string; items: NavItem[]; }

const NAVIGATION: NavGroup[] = [
  { label: "Work", items: [
    { label: "Chat", path: "/chat", icon: "chat" },
    { label: "Conversations", path: "/conversations", icon: "conversations" },
    { label: "Research", path: "/research", icon: "research" },
    { label: "Tools", path: "/tools", icon: "tools" },
  ] },
  { label: "Operate", items: [
    { label: "Overview", path: "/", icon: "overview", end: true },
    { label: "Providers", path: "/providers", icon: "providers" },
    { label: "Models & routes", path: "/models", icon: "routes" },
    { label: "Tasks", path: "/tasks", icon: "tasks" },
  ] },
  { label: "Knowledge", items: [
    { label: "Memory", path: "/memory", icon: "memory" },
    { label: "Files", path: "/files", icon: "files" },
    { label: "Knowledge bases", path: "/knowledge", icon: "knowledge" },
  ] },
  { label: "System", items: [
    { label: "API keys", path: "/api-keys", icon: "api-keys" },
    { label: "Usage", path: "/usage", icon: "usage" },
    { label: "Audit", path: "/audit", icon: "audit" },
    { label: "Runtime", path: "/runtime", icon: "runtime" },
  ] },
];

const TITLES = new Map(NAVIGATION.flatMap((group) => group.items.map((item) => [item.path, item.label] as const)));

export function AppShell() {
  const { logout, principal } = useAuth();
  const { preference, setPreference } = useThemePreference();
  const location = useLocation();
  const navigationType = useNavigationType();
  const [mobileOpen, setMobileOpen] = useState(false);
  const compact = useMediaQuery("(max-width: 820px)");
  const sidebarRef = useRef<HTMLElement>(null);
  const mobileMenuRef = useRef<HTMLButtonElement>(null);
  const sidebarWasOpen = useRef(false);
  const latency = useQuery({
    queryKey: ["hub-latency"],
    queryFn: async ({ signal }) => {
      const started = performance.now();
      await api.request<HealthResponse>("/health", { signal });
      return { latencyMs: roundLatencyMs(started, performance.now()) };
    },
    refetchInterval: HUB_LATENCY_POLL_MS,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const title = useMemo(() => {
    const exact = TITLES.get(location.pathname);
    if (exact) return exact;
    return NAVIGATION.flatMap((group) => group.items).find((item) => item.path !== "/" && location.pathname.startsWith(`${item.path}/`))?.label ?? "Helmora";
  }, [location.pathname]);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => { window.removeEventListener("keydown", closeOnEscape); };
  }, [mobileOpen]);
  useEffect(() => {
    if (!compact) return;
    if (mobileOpen) {
      sidebarWasOpen.current = true;
      const first = sidebarRef.current?.querySelector<HTMLElement>("a.nav-link, button");
      first?.focus();
    } else if (sidebarWasOpen.current) {
      sidebarWasOpen.current = false;
      mobileMenuRef.current?.focus();
    }
  }, [mobileOpen, compact]);

  return (
    <div className="app-shell">
      {mobileOpen ? <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => { setMobileOpen(false); }} /> : null}
      <aside id="primary-sidebar" ref={sidebarRef} inert={compact && !mobileOpen} className={`sidebar${mobileOpen ? " sidebar--open" : ""}`}>
        <div className="sidebar__brand"><Brand /></div>
        <nav className="sidebar__nav" aria-label="Primary navigation">
          {NAVIGATION.map((group) => (
            <section className="nav-group" key={group.label}>
              <h2>{group.label}</h2>
              {group.items.map((item) => (
                <NavLink key={item.path} to={item.path} {...(item.end === undefined ? {} : { end: item.end })} className={({ isActive }) => `nav-link${isActive ? " nav-link--active" : ""}`}>
                  <span className="nav-link__glyph" aria-hidden="true"><FunctionIcon name={item.icon} /></span><span>{item.label}</span>
                </NavLink>
              ))}
            </section>
          ))}
        </nav>
        <div className="sidebar__footer">
          <div className="identity">
            <span className="identity__avatar">{(principal?.userId ?? "H").slice(-1).toUpperCase()}</span>
            <span><strong>Owner</strong><small>{principal?.tenantId ?? "Helmora Hub"}</small></span>
          </div>
          <Button label="Sign out" variant="ghost" size="sm" onClick={() => { void logout(); }} />
        </div>
      </aside>

      <div className="app-shell__main" inert={compact && mobileOpen}>
        <header className="topbar">
          <div className="topbar__start">
            <button ref={mobileMenuRef} className="mobile-menu" aria-label="Open navigation" aria-controls="primary-sidebar" aria-expanded={mobileOpen} onClick={() => { setMobileOpen(true); }}>☰</button>
            <div><p className="topbar__crumb">Helmora Hub</p><h1>{title}</h1></div>
          </div>
          <div className="topbar__actions">
            <HubLatencyBadge
              state={latency.isError ? "error" : latency.isSuccess ? "success" : "pending"}
              {...(latency.data?.latencyMs === undefined ? {} : { latencyMs: latency.data.latencyMs })}
            />
            <ThemeControl preference={preference} setPreference={setPreference} />
          </div>
        </header>
        <main className="workspace">
          <div key={location.pathname} className={`workspace__route workspace__route--${navigationType === "POP" ? "back" : "forward"}`}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function HubLatencyBadge({ state, latencyMs }: { state: "pending" | "error" | "success"; latencyMs?: number }) {
  const variant = state === "success" ? "success" : state === "error" ? "error" : "neutral";
  // On error, never pass a prior success ms into the label formatter for the visible badge text.
  const visibleMs = state === "success" ? latencyMs : undefined;
  const label = formatHubLatencyLabel(state, visibleMs);
  const title = hubLatencyAccessibleName(state, visibleMs);
  return <div className="hub-latency" role="img" title={title} aria-label={title}><Badge variant={variant} label={label} /></div>;
}

function ThemeControl({ preference, setPreference }: { preference: ThemePreference; setPreference: (value: ThemePreference) => void }) {
  const next: Record<ThemePreference, ThemePreference> = { system: "light", light: "dark", dark: "system" };
  const icon: Record<ThemePreference, string> = { system: "◐", light: "☼", dark: "☾" };
  return <button className="theme-control" title={`Theme: ${preference}`} aria-label={`Theme is ${preference}; switch to ${next[preference]}`} onClick={() => { setPreference(next[preference]); }}><span aria-hidden="true">{icon[preference]}</span><span>{preference}</span></button>;
}
