// Purpose: inventoryStore.js provides exports: createInventoryStore.
// Interacts with: imports: ../core/invariants.js, ../core/model.js.
// Role: inventory subsystem module within the broader app graph.
import { makeMaterialFromDraft } from "../core/model.js";
import { assertDraft, assertMaterial, assertNumericTree } from "../core/invariants.js";

export function createInventoryStore() {
  const items = new Map();
  let needsMigration = false;

  function add(draft, options = {}) {
    if (!draft || !draft.type) return null;
    assertDraft(draft);
    assertNumericTree(draft.payload.values, "inventory.add");
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

  function normalizeLegacyPayload(raw) {
    if (!raw) return raw;
    if (raw && typeof raw === "object" && raw.kind === "numericTree") {
      return raw.values;
    }
    if (raw && typeof raw === "object" && Object.prototype.hasOwnProperty.call(raw, "values")) {
      return raw.values;
    }
    return raw;
  }

  function deserialize(payload) {
    items.clear();
    if (!Array.isArray(payload)) return;
    payload.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const materialId = item.materialId || item.id;
      if (!materialId) return;
      const legacyPayload = normalizeLegacyPayload(item.payload || item.data || item.values || []);
      if (item.id && !item.materialId) needsMigration = true;
      if (item.data && !item.payload) needsMigration = true;
      if (item.values && !item.payload) needsMigration = true;
      const summaryText = typeof item.summary === "string"
        ? item.summary
        : (item.summary && typeof item.summary === "object" && item.summary.title ? String(item.summary.title) : "");
      const legacyTags = Array.isArray(item.tags)
        ? item.tags
        : (item.meta && Array.isArray(item.meta.tags) ? item.meta.tags : []);
      if (!item.tags && item.meta && Array.isArray(item.meta.tags)) needsMigration = true;
      let legacyInvalid = false;
      let legacyError = "";
      try {
        assertNumericTree(legacyPayload, `material:${item.name || item.materialId}`);
      } catch (error) {
        legacyInvalid = true;
        legacyError = error && error.message ? error.message : "Legacy payload invalid.";
      }
      const normalized = {
        materialId,
        type: item.type || "Unknown",
        subtype: item.subtype || undefined,
        name: legacyInvalid ? "Legacy item invalid" : (item.name || "Untitled material"),
        payload: legacyInvalid ? null : legacyPayload,
        summary: legacyInvalid ? "Legacy item invalid" : summaryText,
        tags: Array.isArray(legacyTags) ? legacyTags.slice() : [],
        meta: item.meta && typeof item.meta === "object"
          ? { ...item.meta, legacyInvalid, legacyError }
          : { legacyInvalid, legacyError },
        provenance: item.provenance && typeof item.provenance === "object" ? { ...item.provenance } : {},
        createdAt: Number.isFinite(item.createdAt) ? item.createdAt : Date.now()
      };
      try {
        if (!legacyInvalid) {
          assertMaterial(normalized);
        }
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
