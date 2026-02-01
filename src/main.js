// Purpose: main.js is a side-effect module.
// Interacts with: ./ui/theme.js
// Role: module module within the broader app graph.
import { applyTheme, getPreferredTheme } from "./ui/theme.js";

applyTheme(getPreferredTheme());

import("./reactMain.jsx");
