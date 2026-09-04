"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import {
  resolveColorMode,
  sanitizeAccentTheme,
  type AccentTheme,
  type ColorMode,
  type ResolvedColorMode,
} from "@/modules/theme/accents";

type ThemeContextValue = {
  colorMode: ColorMode;
  resolvedColorMode: ResolvedColorMode;
  accent: AccentTheme;
  setColorMode: (mode: ColorMode) => void;
  /** Accent is Owner-controlled; exposed read-only to players. */
  accentLocked: true;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyDomTheme(colorMode: ResolvedColorMode, accent: AccentTheme) {
  const root = document.documentElement;
  root.dataset.colorMode = colorMode;
  root.dataset.accent = accent;
  root.style.colorScheme = colorMode;
}

export function ThemeProvider({
  children,
  initialColorMode = "system",
  initialAccent = "green",
}: {
  children: ReactNode;
  initialColorMode?: ColorMode;
  initialAccent?: AccentTheme;
}) {
  const [colorMode, setColorModeState] = useState<ColorMode>(initialColorMode);
  const [accent] = useState<AccentTheme>(sanitizeAccentTheme(initialAccent));
  const [resolvedColorMode, setResolvedColorMode] =
    useState<ResolvedColorMode>(
      initialColorMode === "light" || initialColorMode === "dark"
        ? initialColorMode
        : "dark",
    );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      const resolved = resolveColorMode(colorMode, media.matches);
      setResolvedColorMode(resolved);
      applyDomTheme(resolved, accent);
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [colorMode, accent]);

  const setColorMode = useCallback((mode: ColorMode) => {
    setColorModeState(mode);
    try {
      window.localStorage.setItem("gikgok.colorMode", mode);
    } catch {
      // ignore storage failures
    }
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        colorMode,
        resolvedColorMode,
        accent,
        setColorMode,
        accentLocked: true,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
