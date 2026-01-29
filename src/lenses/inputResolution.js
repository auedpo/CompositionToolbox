// Purpose: inputResolution.js provides exports: isFreezeRef, normalizeInputRef, resolveValuesForRole.
// Interacts with: no imports.
// Role: lens domain layer module within the broader app graph.
function buildDraftIndex(draftCatalog) {
  const index = new Map();
  (draftCatalog || []).forEach((draft) => {
    if (!draft || typeof draft !== "object") return;
    const id = draft.draftId || draft.id || null;
    if (!id) return;
    index.set(id, draft);
  });
  return index;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function ensureNumericArray(value) {
  if (!Array.isArray(value)) return false;
  return value.every((entry) => isFiniteNumber(entry));
}

function acceptsDraftBySpec(draft, accepts) {
  if (!draft || !draft.payload || typeof draft.payload.kind !== "string") return false;
  if (!accepts) return true;
  const acceptList = Array.isArray(accepts) ? accepts : [accepts];
  if (!acceptList.length) return true;
  if (acceptList.includes("numericTree")) {
    return draft.payload.kind === "numericTree";
  }
  return false;
}

function buildMessage(role, reason) {
  if (reason === "missing_draft") {
    return `Input ${role} missing draft.`;
  }
  if (reason === "invalid_payload") {
    return `Input ${role} contains invalid values.`;
  }
  return `Input ${role} unresolved.`;
}

export function normalizeInputRef(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    return { mode: "freeze", sourceDraftId: value };
  }
  return null;
}

export function isFreezeRef(ref) {
  if (!ref) return false;
  if (typeof ref === "string") return true;
  if (ref.mode === "freeze") return true;
  if (!ref.mode && ref.sourceDraftId) return true;
  return false;
}

export function resolveValuesForRole({
  instance,
  roleSpec,
  upstreamInstance,
  getLensInstanceById,
  draftCatalog
}) {
  const spec = roleSpec || {};
  const role = typeof spec.role === "string" ? spec.role : "";
  const required = spec.required !== false;
  const allowUpstream = spec.allowUpstream !== false;
  const fallbackLiteralKey = spec.fallbackLiteralKey || null;
  const accepts = spec.accepts || "numericTree";
  const selectedRefs = instance && instance.selectedInputRefsByRole ? instance.selectedInputRefsByRole : {};
  const liveRefs = instance && instance._liveInputRefs ? instance._liveInputRefs : {};
  const explicitRef = normalizeInputRef(selectedRefs[role]) || normalizeInputRef(liveRefs[role]);
  const index = buildDraftIndex(draftCatalog || []);

  function checkDraft(draft) {
    if (!draft) return false;
    if (!acceptsDraftBySpec(draft, accepts)) return false;
    if (!draft.payload || !Array.isArray(draft.payload.values)) return false;
    return true;
  }

  if (explicitRef) {
    if (explicitRef.mode === "active" || (!explicitRef.mode && explicitRef.sourceLensInstanceId)) {
      const sourceId = explicitRef.sourceLensInstanceId;
      const sourceInstance = typeof getLensInstanceById === "function"
        ? getLensInstanceById(sourceId)
        : null;
      const draft = sourceInstance ? sourceInstance.activeDraft : null;
      if (!draft) {
        return {
          ok: false,
          reason: "missing_draft",
          message: buildMessage(role, "missing_draft")
        };
      }
      if (!checkDraft(draft)) {
        return {
          ok: false,
          reason: "invalid_payload",
          message: buildMessage(role, "invalid_payload")
        };
      }
      return {
        ok: true,
        source: "active",
        values: draft.payload.values,
        draft,
        ref: { mode: "active", sourceLensInstanceId: sourceInstance.lensInstanceId }
      };
    }
    if (explicitRef.mode === "freeze" || explicitRef.sourceDraftId) {
      const draftId = explicitRef.sourceDraftId;
      const draft = index.get(draftId) || null;
      if (!draft || !checkDraft(draft)) {
        return {
          ok: false,
          reason: draft ? "invalid_payload" : "missing_draft",
          message: buildMessage(role, draft ? "invalid_payload" : "missing_draft")
        };
      }
      return {
        ok: true,
        source: "freeze",
        values: draft.payload.values,
        draft,
        ref: { mode: "freeze", sourceDraftId: draftId }
      };
    }
  }

  if (allowUpstream && upstreamInstance) {
    const draft = upstreamInstance.activeDraft || null;
    if (draft && checkDraft(draft)) {
      return {
        ok: true,
        source: "upstream",
        values: draft.payload.values,
        draft,
        ref: {
          mode: "active",
          sourceLensInstanceId: upstreamInstance.lensInstanceId
        }
      };
    }
  }

  if (fallbackLiteralKey && instance && instance.lensInputValues) {
    const literal = instance.lensInputValues[fallbackLiteralKey];
    if (ensureNumericArray(literal)) {
      return {
        ok: true,
        source: "literal",
        values: literal.slice()
      };
    }
    if (required) {
      return {
        ok: false,
        reason: "invalid_payload",
        message: buildMessage(role, "invalid_payload")
      };
    }
  }

  return {
    ok: false,
    reason: required ? "missing_draft" : "unresolved",
    message: required ? buildMessage(role, "missing_draft") : buildMessage(role, "unresolved")
  };
}

