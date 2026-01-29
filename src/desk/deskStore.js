// Purpose: deskStore.js provides exports: createDeskStore.
// Interacts with: imports: ../core/invariants.js, ../core/model.js, ./deskModel.js.
// Role: desk subsystem module within the broader app graph.
import { DESK_DEFAULT_DURATION } from "./deskModel.js";
import { makeClipFromMaterial } from "../core/model.js";
import { assertClip } from "../core/invariants.js";

export function createDeskStore() {
  const items = [];
  let needsMigration = false;

  function add({
    materialId,
    start = 0,
    duration = DESK_DEFAULT_DURATION,
    laneId = 0,
    lane = null,
    clipLocalTransforms = null
  }) {
    if (!materialId) return null;
    const resolvedLane = Number.isFinite(laneId) ? laneId : (Number.isFinite(lane) ? lane : 0);
    const obj = makeClipFromMaterial(materialId, {
      laneId: resolvedLane,
      start,
      duration,
      clipLocalTransforms
    });
    assertClip(obj);
    items.push(obj);
    return obj;
  }

  function move(id, updates) {
    const obj = items.find((item) => item.clipId === id);
    if (!obj) return null;
    Object.assign(obj, updates);
    if (Object.prototype.hasOwnProperty.call(updates, "lane")) {
      obj.laneId = updates.lane;
      delete obj.lane;
    }
    if (Object.prototype.hasOwnProperty.call(updates, "localTransforms")) {
      obj.clipLocalTransforms = updates.localTransforms;
      delete obj.localTransforms;
    }
    assertClip(obj);
    return obj;
  }

  function remove(id) {
    const idx = items.findIndex((item) => item.clipId === id);
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
    needsMigration = false;
    return items.slice();
  }

  function deserialize(payload) {
    items.splice(0, items.length);
    if (!Array.isArray(payload)) return;
    payload.forEach((item) => {
      if (!item || !item.materialId) return;
      const clipId = item.clipId || item.id;
      if (!clipId) return;
      if (item.id && !item.clipId) needsMigration = true;
      if (Object.prototype.hasOwnProperty.call(item, "lane")) needsMigration = true;
      if (Object.prototype.hasOwnProperty.call(item, "localTransforms")) needsMigration = true;
      const normalized = {
        clipId,
        materialId: item.materialId,
        laneId: Number.isFinite(item.laneId) ? item.laneId : (Number.isFinite(item.lane) ? item.lane : 0),
        start: Number.isFinite(item.start) ? item.start : 0,
        duration: Number.isFinite(item.duration) ? item.duration : DESK_DEFAULT_DURATION,
        clipLocalTransforms: item.clipLocalTransforms || item.localTransforms || null,
        createdAt: Number.isFinite(item.createdAt) ? item.createdAt : Date.now()
      };
      try {
        assertClip(normalized);
      } catch (error) {
        console.warn("Skipping invalid clip during deserialize.", error, normalized);
        return;
      }
      items.push(normalized);
    });
  }

  return {
    add,
    move,
    remove,
    list,
    clear,
    serialize,
    deserialize,
    needsMigration: () => needsMigration
  };
}
