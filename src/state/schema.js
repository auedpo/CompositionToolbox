// Purpose: schema.js provides exports: createEmptyAuthoritative, createEmptyDerived, createInitialState, SCHEMA_VERSION.
// Interacts with: no imports.
// Role: state layer module within the broader app graph.
export const SCHEMA_VERSION = 1;

export function createEmptyAuthoritative() {
  return {
    workspace: {
      tracksById: {},
      trackOrder: []
    },
    lenses: {
      lensInstancesById: {}
    },
    inventory: {
      itemsById: {},
      itemOrder: []
    },
    desk: {
      nodesById: {},
      nodeOrder: []
    },
    selection: {
      trackId: undefined,
      lensInstanceId: undefined,
      draftId: undefined,
      panel: undefined
    },
    persistence: {
      schemaVersion: SCHEMA_VERSION,
      dirty: false,
      lastError: undefined
    }
  };
}

export function createEmptyDerived() {
  return {
    drafts: {
      draftsById: {},
      draftOrderByLensInstanceId: {},
      activeDraftIdByLensInstanceId: {}
    },
    errors: {
      lastErrorByLensInstanceId: {}
    },
    meta: {
      lastDerivedAt: 0,
      lastActionType: undefined
    }
  };
}

export function createInitialState() {
  return {
    authoritative: createEmptyAuthoritative(),
    derived: createEmptyDerived()
  };
}
