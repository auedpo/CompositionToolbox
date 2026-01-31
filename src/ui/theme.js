const THEME_STORAGE_KEY = "compositionTheme";
const DEFAULT_THEME = "dark";

function safeGetStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getPreferredTheme() {
  const storage = safeGetStorage();
  if (!storage) {
    return DEFAULT_THEME;
  }

  const stored = storage.getItem(THEME_STORAGE_KEY);
  return stored || DEFAULT_THEME;
}

export function persistTheme(theme) {
  const storage = safeGetStorage();
  if (!storage) return;
  try {
    storage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore write failures
  }
}

export function applyTheme(theme) {
  if (typeof document === "undefined") return;
  if (!theme) {
    document.documentElement.removeAttribute("data-theme");
    return;
  }

  document.documentElement.setAttribute("data-theme", theme);
}

export function nextTheme(current) {
  return current === "light" ? "dark" : "light";
}
