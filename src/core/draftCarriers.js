// Purpose: draftCarriers.js provides exports: normalizeCarrierMeta, isCarrierDraft, isPackedDraftCarrier, getCarrierFrames, validateCarrierCoherence.
// Interacts with: no external modules currently.
// Role: core helper layer for packing-aware utilities.

const KNOWN_CARRIERS = {
  packDrafts: new Set([1])
};

export function normalizeCarrierMeta(metaCarrier) {
  if (!metaCarrier || typeof metaCarrier !== 'object') return null;
  const kind = typeof metaCarrier.kind === 'string' ? metaCarrier.kind : null;
  if (!kind) return null;
  const version = metaCarrier.v;
  if (!Number.isFinite(version) || !Number.isInteger(version)) return null;
  const allowed = KNOWN_CARRIERS[kind];
  if (!allowed || !allowed.has(version)) return null;
  return { kind, v: version };
}

export function isCarrierDraft(draft, kind) {
  if (!draft || typeof draft !== 'object' || typeof kind !== 'string' || !kind) {
    return false;
  }
  const carrier = draft.meta && typeof draft.meta === 'object' ? draft.meta.carrier : null;
  return carrier && carrier.kind === kind;
}

export function isPackedDraftCarrier(draft) {
  if (isCarrierDraft(draft, 'packDrafts')) return true;
  const provenance = draft && draft.meta && typeof draft.meta === 'object'
    ? draft.meta.provenance
    : null;
  if (!provenance || typeof provenance !== 'object') return false;
  return provenance.kind === 'virtual' && provenance.packaging === 'packDrafts';
}

export function getCarrierFrames(draft) {
  if (!isCarrierDraft(draft, 'packDrafts')) return null;
  const payload = draft && draft.payload && typeof draft.payload === 'object' ? draft.payload : null;
  if (!payload) return [];
  const values = payload.values;
  return Array.isArray(values) ? values : [];
}

export function validateCarrierCoherence(draft) {
  if (!isPackedDraftCarrier(draft)) return { ok: true };
  const payload = draft && draft.payload && typeof draft.payload === 'object' ? draft.payload : null;
  if (!payload) {
    return { ok: false, warning: 'Packed carrier missing payload.' };
  }
  const frames = payload.values;
  if (!Array.isArray(frames)) {
    return { ok: false, warning: 'Packed carrier payload.values must be an array.' };
  }
  const provenance = draft && draft.meta && typeof draft.meta === 'object'
    ? draft.meta.provenance
    : null;
  if (provenance) {
    const sourceDraftIds = provenance.sourceDraftIds;
    if (sourceDraftIds !== undefined && !Array.isArray(sourceDraftIds)) {
      return { ok: false, warning: 'Packed carrier provenance.sourceDraftIds must be an array.' };
    }
    if (Array.isArray(sourceDraftIds) && sourceDraftIds.length !== frames.length) {
      return {
        ok: false,
        warning: `Packed carrier has ${frames.length} frame${frames.length === 1 ? '' : 's'} but provenance.sourceDraftIds contains ${sourceDraftIds.length} ${sourceDraftIds.length === 1 ? 'entry' : 'entries'}.`
      };
    }
  }
  return { ok: true };
}
