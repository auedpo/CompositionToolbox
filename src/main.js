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

if (useLegacyUI) {
  import("./legacy/legacyMain.js");
} else {
  import("./reactMain.jsx");
}
