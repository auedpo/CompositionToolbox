import { newId } from "../core/ids.js";
import { DESK_DEFAULT_DURATION } from "./deskModel.js";
import { warnIfInvalidMaterialId } from "../core/guards.js";

export function createDeskStore() {
  const items = [];

  function add({ materialId, start = 0, duration = DESK_DEFAULT_DURATION, lane = 0, localTransforms = null }) {
    if (!materialId) return null;
    warnIfInvalidMaterialId(materialId, "deskStore.add");
    const id = newId("desk");
    const obj = {
      id,
      materialId,
      start,
      duration,
      lane,
      localTransforms: localTransforms || null
    };
    items.push(obj);
    return obj;
  }

  function move(id, updates) {
    const obj = items.find((item) => item.id === id);
    if (!obj) return null;
    Object.assign(obj, updates);
    return obj;
  }

  function remove(id) {
    const idx = items.findIndex((item) => item.id === id);
    if (idx < 0) return false;
    items.splice(idx, 1);
    return true;
  }

  function list() {
    return items.slice();
  }

  function clear() {
    items.splice(0, items.length);
  }

  function serialize() {
    return items.slice();
  }

  function deserialize(payload) {
    items.splice(0, items.length);
    if (!Array.isArray(payload)) return;
    payload.forEach((item) => {
      if (!item || !item.id || !item.materialId) return;
      items.push({ ...item });
    });
  }

  return {
    add,
    move,
    remove,
    list,
    clear,
    serialize,
    deserialize
  };
}
