// Purpose: icons.js provides exports: icon.
// Interacts with: imports: lucide.
// Role: UI layer module within the broader app graph.
import { createElement, icons } from "lucide";

const fallbackIcon = "circle-help";
const ariaAttributes = ["aria-hidden", "aria-label", "aria-labelledby", "aria-describedby"];

export function icon(name, options = {}) {
  const normalizeName = (value) => value
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ""))
    .join("");
  const {
    size = 16,
    strokeWidth = 2,
    className = "icon",
    attrs = {}
  } = options;
  let iconNode = icons[name] || icons[normalizeName(name)];
  if (!iconNode) {
    console.warn(`[icons] Unknown icon "${name}", using "${fallbackIcon}".`);
    iconNode = icons[fallbackIcon] || icons[normalizeName(fallbackIcon)];
  }
  if (!iconNode) {
    throw new Error(`Icon "${name}" not found and fallback "${fallbackIcon}" missing.`);
  }
  const hasAria = ariaAttributes.some((key) => Object.prototype.hasOwnProperty.call(attrs, key));
  const mergedAttrs = {
    width: size,
    height: size,
    strokeWidth,
    class: className,
    ...attrs
  };
  if (!hasAria) {
    mergedAttrs["aria-hidden"] = "true";
  }
  return createElement(iconNode, mergedAttrs);
}
