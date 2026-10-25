/**
 * Telegram WebApp SDK typed wrapper.
 * All accesses are SSR-safe (checks for `window`).
 */

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

export interface TelegramWebApp {
  ready: () => void;
  expand: () => void;
  close: () => void;
  initData: string;
  initDataUnsafe: {
    user?: TelegramUser;
    chat?: { id: number; type?: string; title?: string };
    start_param?: string;
    [key: string]: unknown;
  };
  colorScheme: "light" | "dark";
  themeParams: Record<string, string>;
  BackButton: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  HapticFeedback: {
    impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
    selectionChanged: () => void;
  };
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    show: () => void;
    hide: () => void;
    enable: () => void;
    disable: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
    setText: (text: string) => void;
  };
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
}

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } })?.Telegram?.WebApp ?? null;
}

export function getInitData(): string {
  return getTelegramWebApp()?.initData ?? "";
}

export function getTelegramUser(): TelegramUser | null {
  return getTelegramWebApp()?.initDataUnsafe?.user ?? null;
}

let cachedChatId = "";

export function setLaunchChatId(id: string): void {
  const clean = (id || "").trim();
  if (!clean) return;
  cachedChatId = clean;
  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem("fb_chat_id", clean);
      localStorage.setItem("fb_chat_id", clean);
    } catch (_) {}
  }
}

function getStartParam(): string {
  const fromSdk = getTelegramWebApp()?.initDataUnsafe?.start_param;
  if (fromSdk) return fromSdk;
  // Fallback: Telegram passes it in the URL as tgWebAppStartParam.
  if (typeof window !== "undefined") {
    const m = /[?&#]tgWebAppStartParam=([A-Za-z0-9_-]+)/.exec(window.location.href);
    if (m) return m[1];
  }
  return "";
}

/**
 * The group chat id this Mini App launch is scoped to, or "" when opened
 * outside a group (bot DM, dev browser). Reverses encode_chat_param() in
 * backend/bot/handlers.py: "g<digits>" → negative id, "c<digits>" → positive.
 * Persists in sessionStorage / localStorage across Next.js page transitions.
 */
export function launchChatId(): string {
  if (cachedChatId) return cachedChatId;

  // 1. Direct URL search parameters (?chat_id= or ?chatId=)
  if (typeof window !== "undefined") {
    try {
      const sp = new URLSearchParams(window.location.search);
      const urlId = sp.get("chat_id") || sp.get("chatId");
      if (urlId && urlId.trim()) {
        setLaunchChatId(urlId.trim());
        return cachedChatId;
      }
    } catch (_) {}
  }

  // 2. Telegram WebApp start_param or tgWebAppStartParam
  const p = getStartParam();
  if (p) {
    let resolved = "";
    const mg = /^g(\d+)$/.exec(p);
    if (mg) resolved = `-${mg[1]}`;
    const mc = /^c(\d+)$/.exec(p);
    if (mc) resolved = mc[1];
    if (/^-?\d+$/.test(p)) resolved = p; // tolerate a raw chat id
    if (resolved) {
      setLaunchChatId(resolved);
      return cachedChatId;
    }
  }

  // 3. Telegram WebApp chat object
  const chat = getTelegramWebApp()?.initDataUnsafe?.chat;
  if (chat?.id != null) {
    setLaunchChatId(String(chat.id));
    return cachedChatId;
  }

  // 4. Session / Local storage fallback from previous page in session
  if (typeof window !== "undefined") {
    try {
      const stored = sessionStorage.getItem("fb_chat_id") || localStorage.getItem("fb_chat_id");
      if (stored && stored.trim()) {
        cachedChatId = stored.trim();
        return cachedChatId;
      }
    } catch (_) {}
  }

  return "";
}

/** "&chat_id=..." query fragment for API calls, or "" outside a group. */
export function chatIdQuery(first = false): string {
  const id = launchChatId();
  if (!id) return "";
  return `${first ? "?" : "&"}chat_id=${encodeURIComponent(id)}`;
}

export function haptic(type: "success" | "error" | "warning") {
  getTelegramWebApp()?.HapticFeedback?.notificationOccurred(type);
}

export function hapticImpact(style: "light" | "medium" | "heavy" = "light") {
  getTelegramWebApp()?.HapticFeedback?.impactOccurred(style);
}
