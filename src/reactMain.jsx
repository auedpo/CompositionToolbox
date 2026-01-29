import React from "react";
import { createRoot } from "react-dom/client";

import App from "./ui/App.jsx";

const rootEl = typeof document !== "undefined" ? document.getElementById("root") : null;

if (typeof document !== "undefined") {
  document.documentElement.dataset.layout = "workspace";
}

if (rootEl) {
  const root = createRoot(rootEl);
  root.render(<App />);
}
