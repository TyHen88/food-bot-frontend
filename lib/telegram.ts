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
 */
export function launchChatId(): string {
  const p = getStartParam();
  let m = /^g(\d+)$/.exec(p);
  if (m) return `-${m[1]}`;
  m = /^c(\d+)$/.exec(p);
  if (m) return m[1];
  if (/^-?\d+$/.test(p)) return p; // tolerate a raw chat id
  const chat = getTelegramWebApp()?.initDataUnsafe?.chat;
  return chat?.id != null ? String(chat.id) : "";
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
