"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Check, Laptop, Moon, Sun } from "lucide-react";
import { Toaster as SonnerToaster } from "sonner";
import { cn } from "./ui";

export type Theme = "light" | "dark" | "system";

const THEME_KEY = "tracker:theme";

interface ThemeContextValue {
  theme: Theme;
  resolved: "light" | "dark";
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStored(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

/* The stored theme choice lives outside React (localStorage), so it is exposed
   through useSyncExternalStore rather than effect-driven state. Writing to it
   (or an OS preference change) notifies every subscriber, and the only DOM work
   is applying the class in a plain effect — which is expected, not a state sync. */
const themeListeners = new Set<() => void>();

function subscribe(cb: () => void) {
  themeListeners.add(cb);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => {
    themeListeners.delete(cb);
    mq.removeEventListener("change", cb);
  };
}

function getTheme(): Theme {
  return readStored();
}

function getServerTheme(): Theme {
  return "system";
}

function getResolved(): "light" | "dark" {
  return getTheme() === "dark" ||
    (getTheme() === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
    ? "dark"
    : "light";
}

function getServerResolved(): "light" | "dark" {
  return "light";
}

function applyTheme(dark: boolean) {
  const el = document.documentElement;
  el.classList.toggle("dark", dark);
  el.style.colorScheme = dark ? "dark" : "light";
}

function storeTheme(t: Theme) {
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    // private mode / storage blocked — the choice just does not persist
  }
  themeListeners.forEach((l) => l());
}

/**
 * Theme is resolved from a stored choice ("light" / "dark" / "system") plus the
 * OS preference. Persisting the choice (instead of the resolved value) means a
 * later OS switch still moves the app when the user is on "system". The DOM
 * class is applied early by a blocking inline script in the layout, so the
 * effect here only keeps it in sync — there is no flash of the wrong theme.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getTheme, getServerTheme);
  const resolved = useSyncExternalStore(subscribe, getResolved, getServerResolved);

  useEffect(() => {
    applyTheme(resolved === "dark");
  }, [resolved]);

  const set = useCallback((t: Theme) => storeTheme(t), []);

  return <ThemeContext.Provider value={{ theme, resolved, setTheme: set }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Laptop },
];

/** Header dropdown to pick Light / Dark / System. System follows the OS. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = OPTIONS.find((o) => o.value === theme) ?? OPTIONS[2];
  const CurrentIcon = current.icon;

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center justify-center rounded-lg px-2.5 py-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800"
        title={`Theme: ${current.label}`}
        aria-label={`Theme: ${current.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <CurrentIcon className="size-4" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-40 overflow-hidden rounded-lg border border-zinc-200 bg-white p-1 shadow-lg"
        >
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              role="menuitemradio"
              aria-checked={theme === o.value}
              onClick={() => {
                setTheme(o.value);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                theme === o.value
                  ? "bg-zinc-100 font-medium text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              )}
            >
              <o.icon className="size-4 text-zinc-400" />
              {o.label}
              {theme === o.value ? <Check className="ml-auto size-4 text-accent-600" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Sonner toasts styled to match the resolved theme instead of defaulting to the OS. */
export function ThemedToaster() {
  const { resolved } = useTheme();
  return <SonnerToaster theme={resolved} richColors position="top-right" closeButton />;
}