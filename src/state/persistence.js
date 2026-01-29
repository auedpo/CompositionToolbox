import { createJSONStorage } from "zustand/middleware";
import { createEmptyAuthoritative, SCHEMA_VERSION } from "./schema.js";
import { normalizeAuthoritativeState } from "./reducer.js";

const noopStorage = {
  getItem() {
    return null;
  },
  setItem() {},
  removeItem() {}
};

const storage = createJSONStorage(() => {
  if (typeof window === "undefined" || !window.localStorage) {
    return noopStorage;
  }
  return window.localStorage;
});

export function migratePersistedState(persistedState) {
  const base = createEmptyAuthoritative();
  const incoming = persistedState && persistedState.authoritative
    ? persistedState.authoritative
    : (persistedState || {});
  const merged = {
    ...base,
    ...incoming,
    workspace: {
      ...base.workspace,
      ...(incoming.workspace || {})
    },
    lenses: {
      ...base.lenses,
      ...(incoming.lenses || {})
    },
    inventory: {
      ...base.inventory,
      ...(incoming.inventory || {})
    },
    desk: {
      ...base.desk,
      ...(incoming.desk || {})
    },
    selection: {
      ...base.selection,
      ...(incoming.selection || {})
    },
    persistence: {
      ...base.persistence,
      ...(incoming.persistence || {})
    }
  };
  const lensInstancesById = { ...(merged.lenses.lensInstancesById || {}) };
  Object.entries(lensInstancesById).forEach(([lensInstanceId, instance]) => {
    if (!instance || typeof instance !== "object") return;
    if (instance.lensId !== "inputList") return;
    const params = instance.params && typeof instance.params === "object" ? { ...instance.params } : {};
    let mutated = false;
    if ((params.text === undefined || params.text === null) && params.values !== undefined) {
      params.text = JSON.stringify(params.values);
      mutated = true;
    }
    if (instance.input && typeof instance.input.text === "string") {
      if (!params.text) {
        params.text = instance.input.text;
      }
      const nextInput = { ...instance.input };
      delete nextInput.text;
      lensInstancesById[lensInstanceId] = {
        ...instance,
        params,
        input: nextInput
      };
      mutated = true;
    }
    if (mutated && lensInstancesById[lensInstanceId] === instance) {
      lensInstancesById[lensInstanceId] = {
        ...instance,
        params
      };
    }
  });
  merged.lenses = {
    ...merged.lenses,
    lensInstancesById
  };
  const normalized = normalizeAuthoritativeState(merged);
  normalized.persistence.schemaVersion = SCHEMA_VERSION;
  return { authoritative: normalized };
}

export const persistConfig = {
  name: "composition-toolbox",
  version: SCHEMA_VERSION,
  storage,
  partialize: (state) => ({ authoritative: state.authoritative }),
  migrate: (persistedState) => migratePersistedState(persistedState),
  merge: (persistedState, currentState) => {
    if (!persistedState || !persistedState.authoritative) {
      return currentState;
    }
    return {
      ...currentState,
      authoritative: persistedState.authoritative
    };
  }
};
