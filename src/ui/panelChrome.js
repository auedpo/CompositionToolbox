export function createPanelChrome({
  title = "",
  subtitle = "",
  actions = [],
  body = [],
  footer = [],
  className = "",
  id = "",
  size = "normal"
} = {}) {
  const panel = document.createElement("section");
  panel.className = ["panel", "panel-chassis", className].filter(Boolean).join(" ");
  if (id) panel.id = id;
  if (size) panel.dataset.size = size;

  if (title || subtitle || actions.length) {
    const header = document.createElement("div");
    header.className = "panel-header";
    const titleWrap = document.createElement("div");
    titleWrap.className = "panel-title";
    if (title) {
      const titleEl = document.createElement("h3");
      titleEl.textContent = title;
      titleWrap.appendChild(titleEl);
    }
    if (subtitle) {
      const subtitleEl = document.createElement("p");
      subtitleEl.className = "hint";
      subtitleEl.textContent = subtitle;
      titleWrap.appendChild(subtitleEl);
    }
    header.appendChild(titleWrap);
    if (actions && actions.length) {
      const actionWrap = document.createElement("div");
      actionWrap.className = "panel-actions";
      actions.forEach((node) => actionWrap.appendChild(node));
      header.appendChild(actionWrap);
    }
    panel.appendChild(header);
  }

  const bodyWrap = document.createElement("div");
  bodyWrap.className = "panel-body";
  const bodyNodes = Array.isArray(body) ? body : [body];
  bodyNodes.filter(Boolean).forEach((node) => bodyWrap.appendChild(node));
  panel.appendChild(bodyWrap);

  if (footer && footer.length) {
    const footerWrap = document.createElement("div");
    footerWrap.className = "panel-footer";
    footer.forEach((node) => footerWrap.appendChild(node));
    panel.appendChild(footerWrap);
  }

  return panel;
}
