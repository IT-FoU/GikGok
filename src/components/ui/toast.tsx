"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type ToastItem = {
  id: string;
  title: string;
  tone?: "default" | "success" | "danger";
};

type ToastContextValue = {
  push: (toast: Omit<ToastItem, "id">) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  const push = React.useCallback((toast: Omit<ToastItem, "id">) => {
    const id = crypto.randomUUID();
    setItems((current) => [...current, { ...toast, id }]);
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 3200);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6"
        aria-live="polite"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "pointer-events-auto min-w-[16rem] rounded-[var(--radius-lg)] border px-4 py-3 text-sm shadow-[var(--shadow-md)] animate-fade-up",
              item.tone === "success" &&
                "border-[color-mix(in_oklab,var(--status-success)_50%,transparent)] bg-[var(--brand-surface)]",
              item.tone === "danger" &&
                "border-[color-mix(in_oklab,var(--status-danger)_50%,transparent)] bg-[var(--brand-surface)]",
              (!item.tone || item.tone === "default") &&
                "border-[var(--brand-border)] bg-[var(--brand-surface)]",
            )}
            role="status"
          >
            {item.title}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
