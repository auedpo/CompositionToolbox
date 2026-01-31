import React, { useCallback, useEffect, useState } from "react";

import { applyTheme, getPreferredTheme, nextTheme, persistTheme } from "../theme.js";

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    if (typeof document !== "undefined") {
      return document.documentElement.getAttribute("data-theme") || getPreferredTheme();
    }
    return getPreferredTheme();
  });

  useEffect(() => {
    if (typeof document === "undefined") return;
    const current = document.documentElement.getAttribute("data-theme");
    if (current && current !== theme) {
      setTheme(current);
    }
  }, []);

  const handleToggle = useCallback(() => {
    const next = nextTheme(theme);
    applyTheme(next);
    persistTheme(next);
    setTheme(next);
  }, [theme]);

  const label = theme === "light" ? "Switch to dark" : "Switch to light";

  return (
    <button type="button" className="ghost workspace-theme-toggle" onClick={handleToggle}>
      {label}
    </button>
  );
}
