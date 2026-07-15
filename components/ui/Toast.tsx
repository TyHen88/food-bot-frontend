"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, XCircle, Info } from "lucide-react";

type ToastKind = "success" | "error" | "info";

interface ToastItem { id: number; message: string; kind: ToastKind; }

interface ToastContextValue {
  toast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

let _id = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = ++_id;
    setItems(prev => [...prev, { id, message, kind }]);
    setTimeout(() => {
      setItems(prev => prev.filter(t => t.id !== id));
    }, 3500);
  }, []);

  const icons: Record<ToastKind, ReactNode> = {
    success: <CheckCircle2 size={15} />,
    error:   <XCircle size={15} />,
    info:    <Info size={15} />,
  };

  const colors: Record<ToastKind, { bg: string; color: string }> = {
    success: { bg: "var(--color-success)",  color: "#fff" },
    error:   { bg: "var(--color-danger)",   color: "#fff" },
    info:    { bg: "var(--text)",            color: "var(--bg)" },
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast stack — top-right on desktop, top-center on mobile */}
      <div
        className="fixed top-4 right-4 left-4 sm:left-auto sm:w-80 flex flex-col gap-2 z-[100] pointer-events-none"
        style={{ maxWidth: "calc(100vw - 2rem)" }}
      >
        {items.map(item => {
          const { bg, color } = colors[item.kind];
          return (
            <div
              key={item.id}
              className="flex items-center gap-2 px-4 py-3 rounded-[var(--radius-md)] shadow-[var(--shadow-md)] text-sm font-medium pointer-events-auto animate-slide-up"
              style={{ background: bg, color }}
            >
              {icons[item.kind]}
              <span>{item.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
