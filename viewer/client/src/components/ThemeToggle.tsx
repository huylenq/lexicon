import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "lexicon.theme";

function readTheme(): Theme {
  const t = document.documentElement.getAttribute("data-theme");
  return t === "dark" ? "dark" : "light";
}

function applyTheme(t: Theme) {
  document.documentElement.setAttribute("data-theme", t);
  try {
    localStorage.setItem(STORAGE_KEY, t);
  } catch {
    /* ignore quota / private-mode errors */
  }
}

/**
 * Drafting-symbol theme toggle. A half-filled circle (◐ / ◑) — reads as a
 * meridian/registration mark rather than a sun-or-moon icon.
 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(() =>
    typeof document === "undefined" ? "light" : readTheme(),
  );

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  };

  const label = theme === "dark" ? "Cyanotype" : "Whiteprint";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "whiteprint (light)" : "cyanotype (dark)"} theme`}
      title={`${label} — click to switch`}
      className={`text-fg-3 hover:text-fg inline-flex items-center p-1 -m-1 ${className}`}
    >
      <ThemeGlyph theme={theme} />
    </button>
  );
}

function ThemeGlyph({ theme }: { theme: Theme }) {
  // Half-filled circle: filled side indicates the *active* paper side.
  // Light = filled bottom-right hemisphere; dark = filled top-left hemisphere.
  // Outlined in foreground (currentColor), filled in foreground as well.
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1" />
      <path
        d={theme === "dark" ? "M 6 1 A 5 5 0 0 0 6 11 Z" : "M 6 1 A 5 5 0 0 1 6 11 Z"}
        fill="currentColor"
      />
    </svg>
  );
}
