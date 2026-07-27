import { LayerProvider, Theme, defineTheme } from "@astryxdesign/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type ThemePreference = "system" | "light" | "dark";

interface ThemePreferenceValue {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const THEME_STORAGE_KEY = "helmora.theme";
const ThemePreferenceContext = createContext<ThemePreferenceValue | undefined>(undefined);

const helmoraTheme = defineTheme({
  name: "helmora-control",
  color: { accent: "#0b6f68", neutralStyle: "warm", contrast: "standard" },
  typography: {
    scale: { base: 15, ratio: 1.18 },
    body: { family: "IBM Plex Sans", fallbacks: "-apple-system, BlinkMacSystemFont, sans-serif" },
    heading: { family: "Space Grotesk", fallbacks: "-apple-system, BlinkMacSystemFont, sans-serif", weight: "semibold" },
    code: { family: "IBM Plex Mono", fallbacks: "SFMono-Regular, Consolas, monospace" },
  },
  radius: { base: 4, multiplier: 1.25 },
  motion: { fast: 130, medium: 260, slow: 560, ratio: 0.75 },
  tokens: {
    "--color-accent": ["#0b6f68", "#5eead4"],
    "--color-background-body": ["#f4f2ee", "#000000"],
    "--color-background-surface": ["#fcfbf8", "#121718"],
    "--color-background-card": ["#fffefa", "#171d1e"],
    "--color-background-muted": ["#ece9e3", "#202829"],
    "--color-text-primary": ["#17201f", "#eef4f2"],
    "--color-text-secondary": ["#606966", "#a8b3af"],
    "--color-border": ["rgba(23, 32, 31, 0.12)", "rgba(238, 244, 242, 0.13)"],
    "--color-border-emphasized": ["#b7c0bc", "#4a5854"],
  },
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});

/** Test-only: drop cached queries between Vitest cases that share the module singleton. */
export function resetAppQueryClient(): void {
  queryClient.clear();
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [preference, updatePreference] = useState<ThemePreference>(readThemePreference);
  const value = useMemo<ThemePreferenceValue>(() => ({
    preference,
    setPreference: (next) => {
      updatePreference(next);
      try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* Storage can be disabled. */ }
    },
  }), [preference]);

  return (
    <ThemePreferenceContext value={value}>
      <Theme theme={helmoraTheme} mode={preference}>
        <LayerProvider toast={{ position: "bottomEnd", maxVisible: 3 }}>
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </LayerProvider>
      </Theme>
    </ThemePreferenceContext>
  );
}

export function useThemePreference(): ThemePreferenceValue {
  const value = useContext(ThemePreferenceContext);
  if (!value) throw new Error("useThemePreference must be used inside AppProviders.");
  return value;
}

function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch { /* Storage can be disabled. */ }
  return "system";
}
