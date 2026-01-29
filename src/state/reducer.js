// Purpose: reducer.js provides exports: ACTION_TYPES, normalizeAuthoritativeState, reduceAuthoritative.
// Interacts with: imports: ../lenses/lensRegistry.js, ./ids.js, ./schema.js.
// Role: state layer module within the broader app graph.
import { getLens } from "../lenses/lensRegistry.js";
import { createEmptyAuthoritative, SCHEMA_VERSION } from "./schema.js";
import { makeLensInstanceId, makeTrackId } from "./ids.js";

export const ACTION_TYPES = {
  NORMALIZE_SCHEMA: "NORMALIZE_SCHEMA",
  WORKSPACE_ADD_TRACK: "WORKSPACE_ADD_TRACK",
  WORKSPACE_RENAME_TRACK: "WORKSPACE_RENAME_TRACK",
  WORKSPACE_REMOVE_TRACK: "WORKSPACE_REMOVE_TRACK",
  LENS_ADD_INSTANCE: "LENS_ADD_INSTANCE",
  LENS_REMOVE_INSTANCE: "LENS_REMOVE_INSTANCE",
  LENS_MOVE_INSTANCE: "LENS_MOVE_INSTANCE",
  LENS_SET_PARAM: "LENS_SET_PARAM",
  LENS_REPLACE_PARAMS: "LENS_REPLACE_PARAMS",
  LENS_PATCH_PARAMS: "LENS_PATCH_PARAMS",
  LENS_SET_INPUT: "LENS_SET_INPUT",
  SELECTION_SET: "SELECTION_SET",
  PERSISTENCE_MARK_CLEAN: "PERSISTENCE_MARK_CLEAN"
};

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeLensInput(input) {
  const base = { mode: "auto", pinned: false };
  const next = { ...base, ...(input || {}) };
  if (next.mode !== "auto" && next.mode !== "ref") {
    next.mode = "auto";
  }
  if (typeof next.pinned !== "boolean") {
    next.pinned = Boolean(next.pinned);
  }
  if (next.mode !== "ref") {
    delete next.ref;
  }
  return next;
}

export function normalizeAuthoritativeState(authoritative) {
  const base = createEmptyAuthoritative();
  const incoming = authoritative || {};
  const workspace = { ...base.workspace, ...(incoming.workspace || {}) };
  const lenses = { ...base.lenses, ...(incoming.lenses || {}) };
  const inventory = { ...base.inventory, ...(incoming.inventory || {}) };
  const desk = { ...base.desk, ...(incoming.desk || {}) };
  const selection = { ...base.selection, ...(incoming.selection || {}) };
  const persistence = { ...base.persistence, ...(incoming.persistence || {}) };

  const lensInstancesById = { ...(lenses.lensInstancesById || {}) };
  const tracksById = { ...(workspace.tracksById || {}) };
  const trackOrder = ensureArray(workspace.trackOrder).filter((trackId) => tracksById[trackId]);

  Object.entries(lensInstancesById).forEach(([lensInstanceId, instance]) => {
    if (!instance || typeof instance !== "object") {
      delete lensInstancesById[lensInstanceId];
      return;
    }
    lensInstancesById[lensInstanceId] = {
      ...instance,
      lensInstanceId,
      input: normalizeLensInput(instance.input)
    };
  });

  Object.entries(tracksById).forEach(([trackId, track]) => {
    if (!track || typeof track !== "object") {
      delete tracksById[trackId];
      return;
    }
    const nextLensIds = ensureArray(track.lensInstanceIds)
      .filter((lensInstanceId) => Boolean(lensInstancesById[lensInstanceId]));
    tracksById[trackId] = {
      ...track,
      trackId,
      lensInstanceIds: nextLensIds
    };
  });

  if (selection.trackId && !trackOrder.includes(selection.trackId)) {
    selection.trackId = undefined;
  }
  if (selection.lensInstanceId && !lensInstancesById[selection.lensInstanceId]) {
    selection.lensInstanceId = undefined;
  }

  return {
    workspace: {
      ...workspace,
      tracksById,
      trackOrder
    },
    lenses: {
      ...lenses,
      lensInstancesById
    },
    inventory,
    desk,
    selection,
    persistence: {
      ...persistence,
      schemaVersion: SCHEMA_VERSION
    }
  };
}

function cloneParamsForLens(lensId) {
  const lens = getLens(lensId);
  if (lens && lens.defaultParams && typeof lens.defaultParams === "object") {
    return { ...lens.defaultParams };
  }
  if (!lens || !Array.isArray(lens.params)) return {};
  return lens.params.reduce((acc, param) => {
    if (param && typeof param.key === "string") {
      acc[param.key] = param.default;
    }
    return acc;
  }, {});
}

function insertAtIndex(list, item, index) {
  const next = list.slice();
  if (typeof index !== "number" || index < 0 || index > next.length) {
    next.push(item);
  } else {
    next.splice(index, 0, item);
  }
  return next;
}

function removeFromList(list, item) {
  return list.filter((entry) => entry !== item);
}

function setAtPath(source, path, value) {
  if (!Array.isArray(path) || path.length === 0) return source;
  const next = Array.isArray(source) ? source.slice() : { ...(source || {}) };
  let cursor = next;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    const prev = cursor[key];
    const clone = Array.isArray(prev) ? prev.slice() : (prev && typeof prev === "object" ? { ...prev } : {});
    cursor[key] = clone;
    cursor = clone;
  }
  cursor[path[path.length - 1]] = value;
  return next;
}

export function reduceAuthoritative(authoritative, action) {
  const current = normalizeAuthoritativeState(authoritative);
  const type = action && action.type ? action.type : null;
  const payload = action && action.payload ? action.payload : {};

  switch (type) {
    case ACTION_TYPES.NORMALIZE_SCHEMA: {
      return current;
    }
    case ACTION_TYPES.WORKSPACE_ADD_TRACK: {
      const trackId = makeTrackId();
      const name = typeof payload.name === "string" && payload.name.trim()
        ? payload.name.trim()
        : `Lane ${current.workspace.trackOrder.length + 1}`;
      const track = { trackId, name, lensInstanceIds: [] };
      return {
        ...current,
        workspace: {
          ...current.workspace,
          tracksById: {
            ...current.workspace.tracksById,
            [trackId]: track
          },
          trackOrder: [...current.workspace.trackOrder, trackId]
        },
        persistence: {
          ...current.persistence,
          dirty: true
        }
      };
    }
    case ACTION_TYPES.WORKSPACE_RENAME_TRACK: {
      const trackId = payload.trackId;
      if (!trackId || !current.workspace.tracksById[trackId]) return current;
      const name = typeof payload.name === "string" ? payload.name : "";
      return {
        ...current,
        workspace: {
          ...current.workspace,
          tracksById: {
            ...current.workspace.tracksById,
            [trackId]: {
              ...current.workspace.tracksById[trackId],
              name
            }
          }
        },
        persistence: {
          ...current.persistence,
          dirty: true
        }
      };
    }
    case ACTION_TYPES.WORKSPACE_REMOVE_TRACK: {
      const trackId = payload.trackId;
      if (!trackId || !current.workspace.tracksById[trackId]) return current;
      const { [trackId]: removedTrack, ...remainingTracks } = current.workspace.tracksById;
      const nextTrackOrder = current.workspace.trackOrder.filter((id) => id !== trackId);
      const lensIdsToRemove = ensureArray(removedTrack && removedTrack.lensInstanceIds);
      const nextLensInstancesById = { ...current.lenses.lensInstancesById };
      lensIdsToRemove.forEach((lensInstanceId) => {
        delete nextLensInstancesById[lensInstanceId];
      });
      const nextSelection = { ...current.selection };
      if (nextSelection.trackId === trackId) {
        nextSelection.trackId = undefined;
      }
      if (nextSelection.lensInstanceId && !nextLensInstancesById[nextSelection.lensInstanceId]) {
        nextSelection.lensInstanceId = undefined;
      }
      return {
        ...current,
        workspace: {
          ...current.workspace,
          tracksById: remainingTracks,
          trackOrder: nextTrackOrder
        },
        lenses: {
          ...current.lenses,
          lensInstancesById: nextLensInstancesById
        },
        selection: nextSelection,
        persistence: {
          ...current.persistence,
          dirty: true
        }
      };
    }
    case ACTION_TYPES.LENS_ADD_INSTANCE: {
      const trackId = payload.trackId;
      const lensId = payload.lensId;
      const track = current.workspace.tracksById[trackId];
      if (!track || typeof lensId !== "string") return current;
      const lensInstanceId = makeLensInstanceId();
      const params = cloneParamsForLens(lensId);
      const instance = {
        lensInstanceId,
        lensId,
        params,
        input: { mode: "auto", pinned: false },
        ui: {}
      };
      const nextLensInstancesById = {
        ...current.lenses.lensInstancesById,
        [lensInstanceId]: instance
      };
      const nextLensInstanceIds = insertAtIndex(track.lensInstanceIds || [], lensInstanceId, payload.atIndex);
      return {
        ...current,
        workspace: {
          ...current.workspace,
          tracksById: {
            ...current.workspace.tracksById,
            [trackId]: {
              ...track,
              lensInstanceIds: nextLensInstanceIds
            }
          }
        },
        lenses: {
          ...current.lenses,
          lensInstancesById: nextLensInstancesById
        },
        persistence: {
          ...current.persistence,
          dirty: true
        }
      };
    }
    case ACTION_TYPES.LENS_REMOVE_INSTANCE: {
      const trackId = payload.trackId;
      const lensInstanceId = payload.lensInstanceId;
      const track = current.workspace.tracksById[trackId];
      if (!track || !lensInstanceId) return current;
      const nextLensInstanceIds = removeFromList(track.lensInstanceIds || [], lensInstanceId);
      const nextLensInstancesById = { ...current.lenses.lensInstancesById };
      delete nextLensInstancesById[lensInstanceId];
      const nextSelection = { ...current.selection };
      if (nextSelection.lensInstanceId === lensInstanceId) {
        nextSelection.lensInstanceId = undefined;
      }
      return {
        ...current,
        workspace: {
          ...current.workspace,
          tracksById: {
            ...current.workspace.tracksById,
            [trackId]: {
              ...track,
              lensInstanceIds: nextLensInstanceIds
            }
          }
        },
        lenses: {
          ...current.lenses,
          lensInstancesById: nextLensInstancesById
        },
        selection: nextSelection,
        persistence: {
          ...current.persistence,
          dirty: true
        }
      };
    }
    case ACTION_TYPES.LENS_MOVE_INSTANCE: {
      const { fromTrackId, toTrackId, lensInstanceId, toIndex } = payload;
      const fromTrack = current.workspace.tracksById[fromTrackId];
      const toTrack = current.workspace.tracksById[toTrackId];
      if (!fromTrack || !toTrack || !lensInstanceId) return current;
      if (!current.lenses.lensInstancesById[lensInstanceId]) return current;
      if (fromTrackId === toTrackId) {
        const stripped = removeFromList(fromTrack.lensInstanceIds || [], lensInstanceId);
        const reordered = insertAtIndex(stripped, lensInstanceId, toIndex);
        return {
          ...current,
          workspace: {
            ...current.workspace,
            tracksById: {
              ...current.workspace.tracksById,
              [fromTrackId]: {
                ...fromTrack,
                lensInstanceIds: reordered
              }
            }
          },
          persistence: {
            ...current.persistence,
            dirty: true
          }
        };
      }
      const nextFromIds = removeFromList(fromTrack.lensInstanceIds || [], lensInstanceId);
      const nextToIds = insertAtIndex(toTrack.lensInstanceIds || [], lensInstanceId, toIndex);
      return {
        ...current,
        workspace: {
          ...current.workspace,
          tracksById: {
            ...current.workspace.tracksById,
            [fromTrackId]: {
              ...fromTrack,
              lensInstanceIds: nextFromIds
            },
            [toTrackId]: {
              ...toTrack,
              lensInstanceIds: nextToIds
            }
          }
        },
        persistence: {
          ...current.persistence,
          dirty: true
        }
      };
    }
    case ACTION_TYPES.LENS_SET_PARAM: {
      const lensInstanceId = payload.lensInstanceId;
      const path = payload.path;
      if (!lensInstanceId || !current.lenses.lensInstancesById[lensInstanceId]) return current;
      if (!Array.isArray(path)) return current;
      const instance = current.lenses.lensInstancesById[lensInstanceId];
      const nextParams = setAtPath(instance.params || {}, path, payload.value);
      return {
        ...current,
        lenses: {
          ...current.lenses,
          lensInstancesById: {
            ...current.lenses.lensInstancesById,
            [lensInstanceId]: {
              ...instance,
              params: nextParams
            }
          }
        },
        persistence: {
          ...current.persistence,
          dirty: true
        }
      };
    }
    case ACTION_TYPES.LENS_REPLACE_PARAMS: {
      const lensInstanceId = payload.lensInstanceId;
      if (!lensInstanceId || !current.lenses.lensInstancesById[lensInstanceId]) return current;
      const instance = current.lenses.lensInstancesById[lensInstanceId];
      return {
        ...current,
        lenses: {
          ...current.lenses,
          lensInstancesById: {
            ...current.lenses.lensInstancesById,
            [lensInstanceId]: {
              ...instance,
              params: payload.params
            }
          }
        },
        persistence: {
          ...current.persistence,
          dirty: true
        }
      };
    }
    case ACTION_TYPES.LENS_PATCH_PARAMS: {
      const lensInstanceId = payload.lensInstanceId;
      if (!lensInstanceId || !current.lenses.lensInstancesById[lensInstanceId]) return current;
      const instance = current.lenses.lensInstancesById[lensInstanceId];
      const prevParams = instance.params && typeof instance.params === "object" ? instance.params : {};
      const patch = payload.patch && typeof payload.patch === "object" ? payload.patch : {};
      return {
        ...current,
        lenses: {
          ...current.lenses,
          lensInstancesById: {
            ...current.lenses.lensInstancesById,
            [lensInstanceId]: {
              ...instance,
              params: { ...prevParams, ...patch }
            }
          }
        },
        persistence: {
          ...current.persistence,
          dirty: true
        }
      };
    }
    case ACTION_TYPES.LENS_SET_INPUT: {
      const lensInstanceId = payload.lensInstanceId;
      const input = payload.input;
      const instance = current.lenses.lensInstancesById[lensInstanceId];
      if (!instance || !input) return current;
      const nextInput = normalizeLensInput(input);
      return {
        ...current,
        lenses: {
          ...current.lenses,
          lensInstancesById: {
            ...current.lenses.lensInstancesById,
            [lensInstanceId]: {
              ...instance,
              input: nextInput
            }
          }
        },
        persistence: {
          ...current.persistence,
          dirty: true
        }
      };
    }
    case ACTION_TYPES.SELECTION_SET: {
      const nextSelection = { ...current.selection, ...payload };
      return {
        ...current,
        selection: nextSelection
      };
    }
    case ACTION_TYPES.PERSISTENCE_MARK_CLEAN: {
      return {
        ...current,
        persistence: {
          ...current.persistence,
          dirty: false
        }
      };
    }
    default:
      return current;
  }
}
