import { updateSpecValue } from "../lenses/lensRuntime.js";

let openDraftsMenu = null;
let draftsMenuListenerBound = false;

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
  if (spec.kind === "textarea" || spec.multiline) {
    input = document.createElement("textarea");
    if (Number.isFinite(spec.rows)) input.rows = spec.rows;
    input.value = value ?? spec.default ?? "";
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
  const doc = container.ownerDocument;
  const active = doc ? doc.activeElement : null;
  let activeKey = null;
  let activeType = null;
  let selection = null;
  if (active && container.contains(active)) {
    activeKey = active.dataset ? active.dataset.specKey : null;
    activeType = active.tagName;
    if (activeKey && (activeType === "INPUT" || activeType === "TEXTAREA")) {
      const start = active.selectionStart;
      const end = active.selectionEnd;
      if (Number.isFinite(start) && Number.isFinite(end)) {
        selection = { start, end };
      }
    }
  }
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
  if (activeKey) {
    const next = container.querySelector(`[data-spec-key="${activeKey}"]`);
    if (next && typeof next.focus === "function") {
      try {
        next.focus({ preventScroll: true });
      } catch {
        next.focus();
      }
      if (selection && (next.tagName === "INPUT" || next.tagName === "TEXTAREA")
        && typeof next.setSelectionRange === "function") {
        next.setSelectionRange(selection.start, selection.end);
      }
    }
  }
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

function comparePathArrays(a = [], b = []) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const va = Number.isFinite(a[i]) ? a[i] : -1;
    const vb = Number.isFinite(b[i]) ? b[i] : -1;
    if (va < vb) return -1;
    if (va > vb) return 1;
  }
  return 0;
}

function buildOptionText(draft, meta) {
  const title = draft.summary || draft.type;
  const prefix = meta && meta.label
    ? `${meta.label} · ${meta.lensName || "Lens"}`
    : (meta && meta.lensName ? meta.lensName : "Lens");
  return title ? `${prefix}: ${title}` : prefix;
}

export function renderLensInputs(container, inputSpecs, draftCatalog, selectedByRole, onChange, options = {}) {
  if (!container) return;
  container.innerHTML = "";
  const metaById = options.metaById || new Map();
  const trackOrder = Array.isArray(options.trackOrder) ? options.trackOrder : [];
  const activeByLens = options.activeDraftIdByLensInstanceId || new Map();

  function normalizeRef(ref) {
    if (!ref) return null;
    if (typeof ref === "string") return { mode: "freeze", sourceDraftId: ref };
    if (ref.mode === "active" && ref.sourceLensInstanceId) return ref;
    if (ref.mode === "freeze" && ref.sourceDraftId) return ref;
    if (!ref.mode && ref.sourceLensInstanceId) return { mode: "active", sourceLensInstanceId: ref.sourceLensInstanceId };
    if (!ref.mode && ref.sourceDraftId) return { mode: "freeze", sourceDraftId: ref.sourceDraftId };
    return null;
  }

  function resolveSelectedDraftId(ref) {
    if (!ref) return null;
    if (typeof ref === "string") return ref;
    if (ref.mode === "freeze") return ref.sourceDraftId || null;
    if ((ref.mode === "active" || !ref.mode) && ref.sourceLensInstanceId) {
      return activeByLens.get(ref.sourceLensInstanceId) || null;
    }
    if (ref.sourceDraftId) return ref.sourceDraftId;
    return null;
  }

  (inputSpecs || []).forEach((spec) => {
    const field = document.createElement("div");
    field.className = "lens-field";
    const label = buildFieldLabel(spec.role, spec.required ? "Required" : "");
    const row = document.createElement("div");
    row.className = "lens-input-row";
    const select = document.createElement("select");
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = spec.required ? `Select ${spec.role} (required)` : `Select ${spec.role}`;
    function buildOptions() {
      select.innerHTML = "";
      select.appendChild(empty);
      const selectedRef = normalizeRef(selectedByRole && selectedByRole[spec.role] ? selectedByRole[spec.role] : null);
      const selectedId = resolveSelectedDraftId(selectedRef);
      const candidates = filterDraftsBySpec(draftCatalog, spec).filter((draft) => {
        const meta = metaById.get(draft.draftId);
        if (meta && meta.isActive) return true;
        return selectedId && draft.draftId === selectedId;
      });
      const grouped = new Map();
      candidates.forEach((draft) => {
        const meta = metaById.get(draft.draftId);
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
          const pathA = (a.meta && Array.isArray(a.meta.path)) ? a.meta.path : [];
          const pathB = (b.meta && Array.isArray(b.meta.path)) ? b.meta.path : [];
          const pathOrder = comparePathArrays(pathA, pathB);
          if (pathOrder !== 0) return pathOrder;
          const labelA = a.meta && a.meta.label ? a.meta.label : "";
          const labelB = b.meta && b.meta.label ? b.meta.label : "";
          return labelA.localeCompare(labelB);
        })
          .forEach(({ draft, meta }) => {
            const option = document.createElement("option");
            option.value = draft.draftId;
            option.textContent = buildOptionText(draft, meta);
            group.appendChild(option);
          });
        select.appendChild(group);
      });
    }
    buildOptions();
    const currentRef = normalizeRef(selectedByRole && selectedByRole[spec.role] ? selectedByRole[spec.role] : null);
    const current = resolveSelectedDraftId(currentRef) || "";
    select.value = current;
    select.addEventListener("change", () => {
      const value = select.value || null;
      if (!onChange) return;
      if (!value) {
        onChange(spec.role, null);
        return;
      }
      const meta = metaById.get(value) || null;
      if (currentRef && currentRef.mode === "active") {
        if (meta && meta.lensInstanceId) {
          onChange(spec.role, { mode: "active", sourceLensInstanceId: meta.lensInstanceId });
        } else {
          onChange(spec.role, { mode: "freeze", sourceDraftId: value });
        }
        return;
      }
      onChange(spec.role, { mode: "freeze", sourceDraftId: value });
    });
    const toggleWrap = document.createElement("div");
    toggleWrap.className = "lens-input-toggle";
    const activeBtn = document.createElement("button");
    activeBtn.type = "button";
    activeBtn.className = "toggle-btn ghost";
    activeBtn.textContent = "Active";
    const freezeBtn = document.createElement("button");
    freezeBtn.type = "button";
    freezeBtn.className = "toggle-btn ghost";
    freezeBtn.textContent = "Freeze";
    const setToggleState = (mode) => {
      activeBtn.classList.toggle("active", mode === "active");
      freezeBtn.classList.toggle("active", mode === "freeze");
    };
    const mode = currentRef && currentRef.mode ? currentRef.mode : "freeze";
    setToggleState(mode);
    activeBtn.addEventListener("click", () => {
      const selectedId = select.value || null;
      if (!onChange) return;
      if (selectedId) {
        const meta = metaById.get(selectedId) || null;
        if (meta && meta.lensInstanceId) {
          onChange(spec.role, { mode: "active", sourceLensInstanceId: meta.lensInstanceId });
          setToggleState("active");
          return;
        }
      }
      onChange(spec.role, { mode: "active", sourceLensInstanceId: currentRef && currentRef.sourceLensInstanceId });
      setToggleState("active");
    });
    freezeBtn.addEventListener("click", () => {
      const selectedId = select.value || null;
      if (!onChange) return;
      if (selectedId) {
        onChange(spec.role, { mode: "freeze", sourceDraftId: selectedId });
      } else {
        onChange(spec.role, null);
      }
      setToggleState("freeze");
    });
    toggleWrap.appendChild(activeBtn);
    toggleWrap.appendChild(freezeBtn);
    row.appendChild(select);
    row.appendChild(toggleWrap);
    field.appendChild(label);
    field.appendChild(row);
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
  const doc = container.ownerDocument;
  if (doc && !draftsMenuListenerBound) {
    doc.addEventListener("click", (event) => {
      if (!openDraftsMenu) return;
      if (openDraftsMenu.contains(event.target)) return;
      openDraftsMenu.classList.remove("is-open");
      openDraftsMenu = null;
    });
    draftsMenuListenerBound = true;
  }
  const header = document.createElement("div");
  header.className = "drafts-header";
  const headerTitle = document.createElement("div");
  headerTitle.className = "drafts-title";
  headerTitle.textContent = "Drafts";
  const menuWrap = document.createElement("div");
  menuWrap.className = "drafts-menu";
  const menuButton = document.createElement("button");
  menuButton.type = "button";
  menuButton.className = "ghost drafts-add";
  menuButton.textContent = "Add";
  const hasActiveDraft = Boolean(instance.activeDraftId);
  menuButton.disabled = !hasActiveDraft;
  const menuList = document.createElement("div");
  menuList.className = "drafts-menu-list";
  const addInventory = document.createElement("button");
  addInventory.type = "button";
  addInventory.className = "drafts-menu-item";
  addInventory.textContent = "Inv.";
  const addDesk = document.createElement("button");
  addDesk.type = "button";
  addDesk.className = "drafts-menu-item";
  addDesk.textContent = "Desk";
  [addInventory, addDesk].forEach((btn) => {
    btn.disabled = !hasActiveDraft;
  });
  menuButton.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!menuButton.disabled) {
      if (openDraftsMenu && openDraftsMenu !== menuWrap) {
        openDraftsMenu.classList.remove("is-open");
      }
      menuWrap.classList.toggle("is-open");
      openDraftsMenu = menuWrap.classList.contains("is-open") ? menuWrap : null;
    }
  });
  const getActiveDraft = () => drafts.find((draft) => draft.draftId === instance.activeDraftId);
  addInventory.addEventListener("click", (event) => {
    event.stopPropagation();
    const activeDraft = getActiveDraft();
    if (activeDraft && handlers && handlers.onAddToInventory) {
      handlers.onAddToInventory(activeDraft);
    }
    menuWrap.classList.remove("is-open");
    openDraftsMenu = null;
  });
  addDesk.addEventListener("click", (event) => {
    event.stopPropagation();
    const activeDraft = getActiveDraft();
    if (activeDraft && handlers && handlers.onAddToDesk) {
      handlers.onAddToDesk(activeDraft);
    }
    menuWrap.classList.remove("is-open");
    openDraftsMenu = null;
  });
  menuList.appendChild(addInventory);
  menuList.appendChild(addDesk);
  menuWrap.appendChild(menuButton);
  menuWrap.appendChild(menuList);
  header.appendChild(headerTitle);
  header.appendChild(menuWrap);
  container.appendChild(header);

  const list = document.createElement("div");
  list.className = "drafts-items";
  container.appendChild(list);

  if (!drafts.length) {
    const empty = document.createElement("div");
    empty.className = "drafts-empty";
    empty.textContent = "No drafts yet.";
    list.appendChild(empty);
    return;
  }
  drafts.forEach((draft) => {
    const row = document.createElement("div");
    row.className = "draft-item";
    if (draft.draftId === instance.activeDraftId) {
      row.classList.add("active");
    }
    const left = document.createElement("div");
    left.className = "draft-left";
    const label = document.createElement("div");
    label.className = "draft-label";
    label.textContent = draft.summary || draft.type;
    const desc = document.createElement("div");
    desc.className = "draft-desc";
    desc.textContent = "";
    left.appendChild(label);
    if (desc.textContent) left.appendChild(desc);
    row.appendChild(left);

    row.addEventListener("click", () => {
      if (handlers && handlers.onSelect) {
        handlers.onSelect(draft);
      }
    });

    list.appendChild(row);
  });
}

export function bindLensInputHandlers(instance, specs, key, value) {
  updateSpecValue(instance.lensInputValues, specs, key, value);
}

export function bindLensParamHandlers(instance, specs, key, value) {
  updateSpecValue(instance.paramsValues, specs, key, value);
}

