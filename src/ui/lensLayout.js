import { updateSpecValue } from "../lenses/lensRuntime.js";

function buildFieldLabel(text, help) {
  const label = document.createElement("label");
  label.textContent = text;
  if (help) label.title = help;
  return label;
}

function buildListPlaceholder(defaultValue) {
  if (Array.isArray(defaultValue)) {
    return defaultValue.join(", ");
  }
  if (typeof defaultValue === "string") {
    return defaultValue;
  }
  return "";
}

function buildSpecInput(spec, value) {
  let input = null;
  if (spec.kind === "select") {
    input = document.createElement("select");
    (spec.options || []).forEach((option) => {
      const opt = document.createElement("option");
      opt.value = option.value;
      opt.textContent = option.label ?? String(option.value);
      input.appendChild(opt);
    });
    input.value = value ?? spec.default ?? "";
    return input;
  }
  if (spec.kind === "bool") {
    input = document.createElement("input");
    input.type = "checkbox";
    input.checked = Boolean(value ?? spec.default);
    return input;
  }
  input = document.createElement("input");
  if (spec.kind === "int" || spec.kind === "number") {
    input.type = "number";
    if (typeof spec.min === "number") input.min = String(spec.min);
    if (typeof spec.max === "number") input.max = String(spec.max);
    if (typeof spec.step === "number") input.step = String(spec.step);
    input.value = value ?? spec.default ?? "";
    return input;
  }
  input.type = "text";
  if (spec.kind === "list:int" || spec.kind === "list:number") {
    input.value = Array.isArray(value) ? value.join(", ") : (value ?? "");
    input.placeholder = buildListPlaceholder(spec.default);
  } else {
    input.value = value ?? spec.default ?? "";
  }
  return input;
}

function renderSpecControls(container, specs, values, onChange, options = {}) {
  container.innerHTML = "";
  const idPrefix = options.idPrefix ? `${options.idPrefix}-` : "";
  (specs || []).forEach((spec) => {
    const field = document.createElement("div");
    field.className = "lens-field";
    const inputId = `${idPrefix}${spec.key}`;
    const label = buildFieldLabel(spec.label, spec.help);
    label.setAttribute("for", inputId);
    const input = buildSpecInput(spec, values[spec.key]);
    input.id = inputId;
    input.dataset.specKey = spec.key;
    input.addEventListener("input", (event) => {
      const target = event.currentTarget;
      const nextValue = target.type === "checkbox" ? target.checked : target.value;
      onChange(spec, nextValue);
    });
    input.addEventListener("change", (event) => {
      const target = event.currentTarget;
      const nextValue = target.type === "checkbox" ? target.checked : target.value;
      onChange(spec, nextValue);
    });
    field.appendChild(label);
    field.appendChild(input);
    container.appendChild(field);
  });
}

export function initLensControls(container, specs, values, onChange, options = {}) {
  if (!container) return;
  renderSpecControls(container, specs, values, onChange, options);
}

function filterDraftsBySpec(drafts, spec) {
  const types = Array.isArray(spec.accepts) ? spec.accepts : [];
  const subtypes = Array.isArray(spec.acceptsSubtypes) ? spec.acceptsSubtypes : null;
  return drafts.filter((draft) => {
    if (!draft || !draft.type) return false;
    if (types.length && !types.includes(draft.type)) return false;
    if (subtypes && subtypes.length && !subtypes.includes(draft.subtype)) return false;
    return true;
  });
}

function formatDraftStats(stats) {
  if (!stats || typeof stats !== "object") return "";
  const entries = Object.entries(stats)
    .filter(([, value]) => typeof value === "number")
    .map(([key, value]) => `${key} ${value.toFixed(3)}`);
  return entries.join(", ");
}

function buildOptionText(draft, meta) {
  const title = draft.summary && draft.summary.title ? draft.summary.title : draft.type;
  const stats = formatDraftStats(draft.summary && draft.summary.stats ? draft.summary.stats : null);
  const prefix = meta && meta.label ? `${meta.label} - ${meta.lensName || "Lens"}` : "Lens";
  if (stats) return `${prefix}: ${title} (${stats})`;
  return `${prefix}: ${title}`;
}

export function renderTransformerInputs(container, inputSpecs, draftCatalog, selectedByRole, onChange, options = {}) {
  if (!container) return;
  container.innerHTML = "";
  const metaById = options.metaById || new Map();
  const trackOrder = Array.isArray(options.trackOrder) ? options.trackOrder : [];
  (inputSpecs || []).forEach((spec) => {
    const field = document.createElement("div");
    field.className = "lens-field";
    const label = buildFieldLabel(spec.role, spec.required ? "Required" : "");
    const search = document.createElement("input");
    search.type = "text";
    search.className = "lens-search";
    search.placeholder = "Search track, label, or draft title";
    const select = document.createElement("select");
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = spec.required ? `Select ${spec.role} (required)` : `Select ${spec.role}`;
    function buildOptions() {
      select.innerHTML = "";
      select.appendChild(empty);
      const selectedId = selectedByRole && selectedByRole[spec.role] ? selectedByRole[spec.role] : null;
      const candidates = filterDraftsBySpec(draftCatalog, spec).filter((draft) => {
        const meta = metaById.get(draft.id);
        if (meta && meta.isActive) return true;
        return selectedId && draft.id === selectedId;
      });
      const query = search.value.trim().toLowerCase();
      const filtered = query
        ? candidates.filter((draft) => {
          const meta = metaById.get(draft.id);
          const title = draft.summary && draft.summary.title ? draft.summary.title : draft.type;
          const labelText = meta && meta.label ? meta.label : "";
          const trackName = meta && meta.trackName ? meta.trackName : "";
          return [title, labelText, trackName].some((value) => String(value).toLowerCase().includes(query));
        })
        : candidates;
      const grouped = new Map();
      filtered.forEach((draft) => {
        const meta = metaById.get(draft.id);
        const trackId = meta && meta.trackId ? meta.trackId : "unknown";
        if (!grouped.has(trackId)) grouped.set(trackId, []);
        grouped.get(trackId).push({ draft, meta });
      });
      const orderedTrackIds = trackOrder.length
        ? trackOrder.filter((id) => grouped.has(id)).concat(Array.from(grouped.keys()).filter((id) => !trackOrder.includes(id)))
        : Array.from(grouped.keys());
      orderedTrackIds.forEach((trackId) => {
        const groupItems = grouped.get(trackId) || [];
        const sampleMeta = groupItems[0] ? groupItems[0].meta : null;
        const trackNumber = sampleMeta && sampleMeta.trackNumber ? sampleMeta.trackNumber : "?";
        const trackName = sampleMeta && sampleMeta.trackName ? sampleMeta.trackName : "Untitled";
        const group = document.createElement("optgroup");
        group.label = `Track ${trackNumber} - ${trackName}`;
        groupItems
          .sort((a, b) => {
            const labelA = a.meta && a.meta.label ? a.meta.label : "";
            const labelB = b.meta && b.meta.label ? b.meta.label : "";
            return labelA.localeCompare(labelB);
          })
          .forEach(({ draft, meta }) => {
            const option = document.createElement("option");
            option.value = draft.id;
            option.textContent = buildOptionText(draft, meta);
            group.appendChild(option);
          });
        select.appendChild(group);
      });
    }
    buildOptions();
    const current = selectedByRole && selectedByRole[spec.role] ? selectedByRole[spec.role] : "";
    select.value = current;
    select.addEventListener("change", () => {
      const value = select.value || null;
      if (onChange) onChange(spec.role, value);
    });
    search.addEventListener("input", () => {
      buildOptions();
      const next = selectedByRole && selectedByRole[spec.role] ? selectedByRole[spec.role] : "";
      select.value = next;
    });
    field.appendChild(label);
    field.appendChild(search);
    field.appendChild(select);
    container.appendChild(field);
  });
}

export function renderLensNotices(container, instance) {
  if (!container) return;
  const result = instance.evaluateResult || {};
  const warnings = Array.isArray(result.warnings) ? result.warnings : [];
  const errors = Array.isArray(result.errors) ? result.errors : [];
  container.innerHTML = "";
  if (errors.length) {
    const block = document.createElement("div");
    block.className = "lens-notice error";
    block.textContent = errors.join(" ");
    container.appendChild(block);
  }
  if (warnings.length) {
    const block = document.createElement("div");
    block.className = "lens-notice warning";
    block.textContent = warnings.join(" ");
    container.appendChild(block);
  }
}

export function renderLensDrafts(container, instance, handlers) {
  if (!container) return;
  const drafts = instance.currentDrafts || [];
  container.innerHTML = "";
  if (!drafts.length) {
    const empty = document.createElement("div");
    empty.className = "drafts-empty";
    empty.textContent = "No drafts yet.";
    container.appendChild(empty);
    return;
  }
  drafts.forEach((draft) => {
    const row = document.createElement("div");
    row.className = "draft-item";
    if (draft.id === instance.activeDraftId) {
      row.classList.add("active");
    }
    const left = document.createElement("div");
    left.className = "draft-left";
    const label = document.createElement("div");
    label.className = "draft-label";
    label.textContent = draft.summary && draft.summary.title ? draft.summary.title : draft.type;
    if (draft.id === instance.activeDraftId) {
      const status = document.createElement("span");
      status.className = "draft-status";
      status.textContent = "Active";
      label.appendChild(status);
    }
    const desc = document.createElement("div");
    desc.className = "draft-desc";
    desc.textContent = draft.summary && draft.summary.description ? draft.summary.description : "";
    left.appendChild(label);
    if (desc.textContent) left.appendChild(desc);
    row.appendChild(left);

    row.addEventListener("click", () => {
      if (handlers && handlers.onSelect) {
        handlers.onSelect(draft);
      }
    });

    const actions = document.createElement("div");
    actions.className = "draft-actions";
    const addDesk = document.createElement("button");
    addDesk.type = "button";
    addDesk.className = "ghost";
    addDesk.textContent = "Add to Desk";
    addDesk.addEventListener("click", (event) => {
      event.stopPropagation();
      if (handlers && handlers.onAddToDesk) handlers.onAddToDesk(draft);
    });
    const addInventory = document.createElement("button");
    addInventory.type = "button";
    addInventory.textContent = "Add to Inventory";
    addInventory.addEventListener("click", (event) => {
      event.stopPropagation();
      if (handlers && handlers.onAddToInventory) handlers.onAddToInventory(draft);
    });
    actions.appendChild(addDesk);
    actions.appendChild(addInventory);
    row.appendChild(actions);
    container.appendChild(row);
  });
}

export function bindLensInputHandlers(instance, specs, key, value) {
  updateSpecValue(instance.generatorInputValues, specs, key, value);
}

export function bindLensParamHandlers(instance, specs, key, value) {
  updateSpecValue(instance.paramsValues, specs, key, value);
}
