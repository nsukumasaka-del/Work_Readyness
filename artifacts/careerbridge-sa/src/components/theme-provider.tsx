import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

export type ThemeMode = "light" | "dark" | "system";

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  resolvedMode: "light" | "dark";
}

const STORAGE_KEY = "bonlist-theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);

function readSavedMode(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // Local storage can be disabled; the app still gets its dark default.
  }
  return "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readSavedMode);
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches,
  );
  const resolvedMode = mode === "system" ? (systemDark ? "dark" : "light") : mode;

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolvedMode === "dark");
    root.style.colorScheme = resolvedMode;
    root.dataset.theme = resolvedMode;
  }, [resolvedMode]);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Theme remains active for this session even when persistence is blocked.
    }
  };

  const value = useMemo(() => ({ mode, setMode, resolvedMode }), [mode, resolvedMode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}

export function ThemeToggle() {
  const { mode, setMode } = useTheme();
  const nextMode: ThemeMode = mode === "dark" ? "light" : mode === "light" ? "system" : "dark";
  const Icon = mode === "dark" ? Moon : mode === "light" ? Sun : Monitor;
  const label = mode === "dark" ? "Dark mode" : mode === "light" ? "Light mode" : "System theme";
  return (
    <button
      type="button"
      onClick={() => setMode(nextMode)}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-card/80 text-foreground shadow-sm transition hover:border-primary/40 hover:bg-muted"
      aria-label={`${label}. Switch to ${nextMode} mode`}
      title={`${label} · click to switch`}
    >
      <Icon size={16} />
    </button>
  );
}
