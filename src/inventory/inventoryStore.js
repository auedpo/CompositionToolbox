import { makeMaterialFromDraft, normalizePayload } from "../core/model.js";
import { assertDraft, assertMaterial } from "../core/invariants.js";

export function createInventoryStore() {
  const items = new Map();
  let needsMigration = false;

  function add(draft, options = {}) {
    if (!draft || !draft.type) return null;
    assertDraft(draft);
    const material = makeMaterialFromDraft(draft, {
      name: options.name,
      tags: Array.isArray(options.tags) ? options.tags.slice() : [],
      meta: options.meta || {}
    });
    assertMaterial(material);
    items.set(material.materialId, material);
    return material;
  }

  function get(id) {
    return items.get(id) || null;
  }

  function list(filter = {}) {
    const text = (filter.text || "").toLowerCase();
    const out = Array.from(items.values());
    if (!text) return out;
    return out.filter((item) => {
      const haystack = `${item.name} ${item.type} ${(item.tags || []).join(" ")}`.toLowerCase();
      return haystack.includes(text);
    });
  }

  function remove(id) {
    return items.delete(id);
  }

  function clear() {
    items.clear();
  }

  function serialize() {
    needsMigration = false;
    return Array.from(items.values());
  }

  function deserialize(payload) {
    items.clear();
    if (!Array.isArray(payload)) return;
    payload.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const materialId = item.materialId || item.id;
      if (!materialId) return;
      const payloadList = normalizePayload(item.payload || item.data || []);
      if (item.id && !item.materialId) needsMigration = true;
      if (item.data && !item.payload) needsMigration = true;
      const summaryText = typeof item.summary === "string"
        ? item.summary
        : (item.summary && typeof item.summary === "object" && item.summary.title ? String(item.summary.title) : "");
      const legacyTags = Array.isArray(item.tags)
        ? item.tags
        : (item.meta && Array.isArray(item.meta.tags) ? item.meta.tags : []);
      if (!item.tags && item.meta && Array.isArray(item.meta.tags)) needsMigration = true;
      const normalized = {
        materialId,
        type: item.type || "Unknown",
        subtype: item.subtype || undefined,
        name: item.name || "Untitled material",
        payload: payloadList,
        summary: summaryText,
        tags: Array.isArray(legacyTags) ? legacyTags.slice() : [],
        meta: item.meta && typeof item.meta === "object" ? { ...item.meta } : {},
        provenance: item.provenance && typeof item.provenance === "object" ? { ...item.provenance } : {},
        createdAt: Number.isFinite(item.createdAt) ? item.createdAt : Date.now()
      };
      try {
        assertMaterial(normalized);
      } catch (error) {
        console.warn("Skipping invalid material during deserialize.", error, normalized);
        return;
      }
      items.set(materialId, normalized);
    });
  }

  return {
    add,
    get,
    list,
    remove,
    clear,
    serialize,
    deserialize,
    needsMigration: () => needsMigration
  };
}
