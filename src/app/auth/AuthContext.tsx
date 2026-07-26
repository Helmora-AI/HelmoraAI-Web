import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, api } from "../../lib/api/client";
import type { LoginRequest, LoginResponse, Principal, ReadyResponse, SessionResponse, SetupRequest, SetupResponse } from "../../lib/api/types";

export type AuthPhase = "checking" | "setup" | "anonymous" | "authenticated" | "unreachable";

interface AuthState {
  phase: AuthPhase;
  principal?: Principal;
  readiness?: ReadyResponse;
  error?: ApiError;
}

interface AuthContextValue extends AuthState {
  refresh: () => Promise<void>;
  setup: (input: SetupRequest) => Promise<SetupResponse>;
  login: (input: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ phase: "checking" });

  const refresh = useCallback(async () => {
    setState((current) => ({ phase: "checking", ...(current.principal === undefined ? {} : { principal: current.principal }), ...(current.readiness === undefined ? {} : { readiness: current.readiness }) }));
    api.clearSessionState();
    try {
      const readiness = await api.request<ReadyResponse>("/ready");
      if (!readiness.initialized) {
        setState({ phase: "setup", readiness });
        return;
      }
      try {
        const session = await api.request<SessionResponse>("/api/v2/auth/session");
        api.setCsrfToken(session.csrf_token);
        setState({ phase: "authenticated", readiness, principal: session.principal });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          setState({ phase: "anonymous", readiness });
          return;
        }
        throw error;
      }
    } catch (error) {
      setState({ phase: "unreachable", error: normalizeError(error) });
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const setup = useCallback(async (input: SetupRequest): Promise<SetupResponse> => {
    const headers = new Headers();
    if (input.setupToken?.trim()) headers.set("x-helmora-setup-token", input.setupToken.trim());
    return await api.request<SetupResponse>("/api/v2/setup", {
      method: "POST",
      headers,
      csrf: false,
      body: { tenantName: input.tenantName, username: input.username, password: input.password },
    });
  }, []);

  const login = useCallback(async (input: LoginRequest): Promise<void> => {
    const result = await api.request<LoginResponse>("/api/v2/auth/login", { method: "POST", body: input, csrf: false });
    api.setCsrfToken(result.csrf_token);
    const session = await api.request<SessionResponse>("/api/v2/auth/session");
    api.setCsrfToken(session.csrf_token ?? result.csrf_token);
    setState((current) => ({ phase: "authenticated", principal: session.principal, ...(current.readiness === undefined ? {} : { readiness: current.readiness }) }));
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await api.request<{ ok: true }>("/api/v2/auth/logout", { method: "POST" });
    } finally {
      api.clearSessionState();
      setState((current) => ({ phase: "anonymous", ...(current.readiness === undefined ? {} : { readiness: current.readiness }) }));
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => ({ ...state, refresh, setup, login, logout }), [state, refresh, setup, login, logout]);
  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}

function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError({ status: 0, code: "UNKNOWN_ERROR", message: error instanceof Error ? error.message : "An unexpected error occurred." });
}
