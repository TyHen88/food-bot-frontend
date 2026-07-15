"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, setInitData } from "@/lib/api";
import { getInitData, getTelegramUser, getTelegramWebApp, type TelegramUser } from "@/lib/telegram";

interface MeResponse {
  user_id: string;
  username?: string;
  full_name?: string;
  role: string;
  is_admin: boolean;
  language?: string;
}

interface AuthState {
  loading: boolean;
  isAdmin: boolean;
  user: TelegramUser | null;
  profile: MeResponse | null;
  initData: string;
}

interface AuthContextValue extends AuthState {
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  loading: true,
  isAdmin: false,
  user: null,
  profile: null,
  initData: "",
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    loading: true,
    isAdmin: false,
    user: null,
    profile: null,
    initData: "",
  });

  const load = useCallback(async () => {
    // Wait for Telegram WebApp initialization if it's not ready immediately
    let tg = getTelegramWebApp();
    let initData = getInitData();
    
    // If inside Telegram (usually in an iframe/webview) but initData is not loaded yet, wait up to 200ms
    if (typeof window !== "undefined" && window.parent !== window && !initData) {
      for (let i = 0; i < 4; i++) {
        await new Promise(resolve => setTimeout(resolve, 50));
        tg = getTelegramWebApp();
        initData = getInitData();
        if (initData) break;
      }
    }

    if (tg) {
      tg.ready();
      tg.expand();
    }

    setInitData(initData);
    const tgUser = getTelegramUser();

    try {
      const me = await api.get<MeResponse>("/me");
      const isAdmin = !!me?.is_admin;

      // Cache role for instant pre-paint on next page load
      try { localStorage.setItem("fb_role", isAdmin ? "admin" : "member"); } catch (_) { /* ignore */ }

      setState({
        loading: false,
        isAdmin,
        user: tgUser,
        profile: me,
        initData,
      });
    } catch {
      // Fail gracefully — show UI as non-admin
      setState({
        loading: false,
        isAdmin: false,
        user: tgUser,
        profile: null,
        initData,
      });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <AuthContext.Provider value={{ ...state, refresh: load }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

/** Guard: renders children only for admins; shows a lock message otherwise. */
export function AdminGuard({ children }: { children: ReactNode }) {
  const { loading, isAdmin } = useAuth();
  if (loading) return null;
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-3 p-8">
        <div className="text-4xl">🔒</div>
        <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>Admin only</h2>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          You need admin access to view this page.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
