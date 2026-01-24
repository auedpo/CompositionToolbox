import { newId } from "../core/ids.js";
import { warnIfDraftHasId, warnIfMaterialMissingId } from "../core/guards.js";

export function createInventoryStore() {
  const items = new Map();

  function add(draft, options = {}) {
    if (!draft || !draft.type) return null;
    warnIfDraftHasId(draft, "inventoryStore.add");
    const id = newId("mat");
    const name = options.name || (draft.summary && draft.summary.title)
      || `${draft.type} ${items.size + 1}`;
    const tags = Array.isArray(options.tags) ? options.tags.slice() : [];
    const meta = { ...(draft.meta || {}) };
    if (tags.length) meta.tags = tags;
    if (!meta.createdAt) meta.createdAt = new Date().toISOString();
    const material = {
      id,
      type: draft.type,
      name,
      data: draft.payload,
      summary: draft.summary || null,
      meta,
      provenance: draft.provenance || null
    };
    warnIfMaterialMissingId(material, "inventoryStore.add");
    items.set(id, material);
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
      const haystack = `${item.name} ${item.type} ${(item.meta && item.meta.tags || []).join(" ")}`.toLowerCase();
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
    return Array.from(items.values());
  }

  function deserialize(payload) {
    items.clear();
    if (!Array.isArray(payload)) return;
    payload.forEach((item) => {
      if (!item || !item.id) return;
      items.set(item.id, item);
    });
  }

  return {
    add,
    get,
    list,
    remove,
    clear,
    serialize,
    deserialize
  };
}
