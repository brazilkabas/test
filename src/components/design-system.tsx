"use client";

import { Moon, Sun, X } from "lucide-react";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useState,
} from "react";

type Toast = { id: string; title: string; message?: string; tone?: "success" | "error" | "info" };
type ToastContextValue = { notify: (toast: Omit<Toast, "id">) => void };

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = useCallback((toast: Omit<Toast, "id">) => {
    const id = crypto.randomUUID();
    setToasts((items) => [...items, { ...toast, id }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4500);
  }, []);
  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div className="toast-region" aria-live="polite" aria-label="Notifications">
        {toasts.map((toast) => (
          <div className={`toast toast-${toast.tone ?? "info"}`} key={toast.id}>
            <div><strong>{toast.title}</strong>{toast.message && <p>{toast.message}</p>}</div>
            <button className="icon-button" aria-label="Dismiss notification" onClick={() => setToasts((items) => items.filter((item) => item.id !== toast.id))}>×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const stored = localStorage.getItem("company-theme");
    const initial = stored === "dark" || (!stored && matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
    document.documentElement.dataset.theme = initial;
    setTheme(initial);
  }, []);
  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem("company-theme", next);
  }
  return <button className="icon-button" onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}</button>;
}

export function Modal({
  open,
  title,
  children,
  onClose,
  footer,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
}) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="modal-header"><h2 id={titleId}>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X size={16} /></button></header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </section>
    </div>
  );
}

export function Drawer({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-header"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X size={16} /></button></header>
        <div className="modal-body">{children}</div>
      </aside>
    </div>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return <div className="skeleton-stack" aria-label="Loading">{Array.from({ length: lines }, (_, index) => <div className="skeleton" key={index} />)}</div>;
}

export function EmptyState({ icon = "◇", title, description, action }: { icon?: string; title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon" aria-hidden>{icon}</span><h3>{title}</h3><p>{description}</p>{action}</div>;
}

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const tone = normalized.includes("connected") || normalized.includes("healthy") || normalized.includes("active") || normalized.includes("success")
    ? "positive"
    : normalized.includes("fail") || normalized.includes("revoked") || normalized.includes("denied")
      ? "negative"
      : normalized.includes("required") || normalized.includes("pending")
        ? "warning"
        : "neutral";
  return <span className={`status status-${tone}`}><span aria-hidden />{status.replaceAll("_", " ")}</span>;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return <Modal open={open} title={title} onClose={onClose} footer={<><button className="secondary" onClick={onClose}>Cancel</button><button className={destructive ? "danger-button" : ""} onClick={onConfirm}>{confirmLabel}</button></>}><p>{description}</p></Modal>;
}
