// Purpose: main.js is a side-effect module.
// Interacts with: no imports.
// Role: module module within the broader app graph.
import { applyTheme, getPreferredTheme } from "./ui/theme.js";

const LEGACY_STORAGE_KEY = "useLegacyUI";

function shouldUseLegacyUI() {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search || "");
    if (params.get("legacy") === "1") return true;
  } catch {
    // ignore
  }
  try {
    return window.localStorage && window.localStorage.getItem(LEGACY_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function setLegacyRootVisibility(showLegacy) {
  if (typeof document === "undefined") return;
  const legacyRoot = document.getElementById("legacyRoot");
  if (legacyRoot) {
    legacyRoot.hidden = !showLegacy;
  }
}

const useLegacyUI = shouldUseLegacyUI();
setLegacyRootVisibility(useLegacyUI);
applyTheme(getPreferredTheme());

if (useLegacyUI) {
  import("./legacy/legacyMain.js");
} else {
  import("./reactMain.jsx");
}
