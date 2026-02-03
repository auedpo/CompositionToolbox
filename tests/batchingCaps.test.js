import assert from "node:assert/strict";

import {
  recomputeDerived,
  resetResolveInputOverride,
  setResolveInputOverride
} from "../src/core/recomputeDerived.js";
import { registerLens } from "../src/lenses/lensRegistry.js";
import { createEmptyAuthoritative } from "../src/state/schema.js";
import { reduceAuthoritative, ACTION_TYPES } from "../src/state/reducer.js";
import { DEFAULT_BATCH_CAPS } from "../src/core/batchingCaps.js";
import * as resolveInputModule from "../src/core/resolveInput.js";

const batchSourceLensId = "b3-batch-source-lens";
registerLens({
  meta: { id: batchSourceLensId, name: "B3 Batch Source", kind: "transformer" },
  defaultParams: { count: 0 },
  evaluate({ params }) {
    const count = Number.isFinite(params.count) ? Math.max(0, Math.floor(params.count)) : 0;
    const drafts = [];
    for (let i = 0; i < count; i += 1) {
      drafts.push({
        payload: {
          kind: "numericTree",
          values: [i]
        }
      });
    }
    return { ok: true, drafts };
  }
});

const batchSinkLensId = "b3-batch-target-lens";
registerLens({
  meta: { id: batchSinkLensId, name: "B3 Batch Sink", kind: "transformer" },
  defaultParams: { variants: 1 },
  evaluate({ params, context }) {
    const variantCount = Number.isFinite(params.variants) ? Math.max(0, Math.floor(params.variants)) : 0;
    const baseValue = Array.isArray(context?.upstreamDraft?.payload?.values)
      ? (context.upstreamDraft.payload.values[0] ?? 0)
      : 0;
    const drafts = [];
    for (let variantIndex = 0; variantIndex < variantCount; variantIndex += 1) {
      drafts.push({
        payload: {
          kind: "numericTree",
          values: [baseValue + variantIndex]
        }
      });
    }
    return { ok: true, drafts };
  }
});

const malformedLensId = "b3-malformed-batch-lens";
registerLens({
  meta: { id: malformedLensId, name: "B3 Malformed Carrier Lens", kind: "transformer" },
  defaultParams: {},
  evaluate() {
    return {
      ok: true,
      drafts: [
        {
          payload: {
            kind: "numericTree",
            values: [0]
          }
        }
      ]
    };
  }
});

const bulkLensId = "b3-bulk-lens";
registerLens({
  meta: { id: bulkLensId, name: "B3 Bulk Lens", kind: "transformer" },
  defaultParams: { count: 0 },
  evaluate({ params }) {
    const count = Number.isFinite(params.count) ? Math.max(0, Math.floor(params.count)) : 0;
    const drafts = [];
    for (let i = 0; i < count; i += 1) {
      drafts.push({
        payload: {
          kind: "numericTree",
          values: [i]
        }
      });
    }
    return { ok: true, drafts };
  }
});

{
  const base = createEmptyAuthoritative();
  const laneId = base.workspace.laneOrder[0];
  let state = reduceAuthoritative(base, {
    type: ACTION_TYPES.LENS_ADD_TO_CELL,
    payload: { lensId: batchSourceLensId, laneId, row: 0 }
  });
  const sourceInstanceId = state.workspace.grid.cells[`${laneId}:0`];
  state = reduceAuthoritative(state, {
    type: ACTION_TYPES.LENS_ADD_TO_CELL,
    payload: { lensId: batchSinkLensId, laneId, row: 1 }
  });
  const sinkInstanceId = state.workspace.grid.cells[`${laneId}:1`];
  state = reduceAuthoritative(state, {
    type: ACTION_TYPES.LENS_REPLACE_PARAMS,
    payload: { lensInstanceId: sourceInstanceId, params: { count: 260 } }
  });
  state = reduceAuthoritative(state, {
    type: ACTION_TYPES.LENS_REPLACE_PARAMS,
    payload: { lensInstanceId: sinkInstanceId, params: { variants: 5 } }
  });
  state = reduceAuthoritative(state, {
    type: ACTION_TYPES.LENS_SET_OUTPUT_SELECTION,
    payload: {
      lensInstanceId: sourceInstanceId,
      outputSelection: {
        mode: "selected",
        selectedIndices: Array.from({ length: 260 }, (_, index) => index)
      }
    }
  });
  state = reduceAuthoritative(state, {
    type: ACTION_TYPES.LENS_SET_INPUT,
    payload: {
      lensInstanceId: sinkInstanceId,
      input: {
        pick: "selected",
        packaging: "packDrafts"
      }
    }
  });
  const derived = recomputeDerived(state);
  const sinkOrder = derived.drafts.draftOrderByLensInstanceId[sinkInstanceId] || [];
  assert.strictEqual(sinkOrder.length, DEFAULT_BATCH_CAPS.maxTotalDraftsPerBatch);
  const sinkWarnings = derived.runtimeWarningsByLensInstanceId[sinkInstanceId] || [];
  assert.ok(sinkWarnings.some((warning) => warning.kind === "truncatedFrames"));
  assert.ok(sinkWarnings.some((warning) => warning.kind === "truncatedBatchOutputs"));
}

{
  let state = createEmptyAuthoritative();
  const laneId = state.workspace.laneOrder[0];
  state = reduceAuthoritative(state, {
    type: ACTION_TYPES.LENS_ADD_TO_CELL,
    payload: { lensId: malformedLensId, laneId, row: 0 }
  });
  const lensInstanceId = state.workspace.grid.cells[`${laneId}:0`];
  try {
    setResolveInputOverride((targetLensInstanceId, authoritative, derivedSoFar) => {
      if (targetLensInstanceId === lensInstanceId) {
        return {
          draftId: "malformed-carrier",
          lensId: "malformed-carrier",
          lensInstanceId: "malformed-source",
          payload: {
            kind: "numericTree",
            values: "not-an-array"
          },
          meta: {
            carrier: { kind: "packDrafts" }
          }
        };
      }
      return resolveInputModule.resolveInput(targetLensInstanceId, authoritative, derivedSoFar);
    });
    const derived = recomputeDerived(state);
    const warnings = derived.runtimeWarningsByLensInstanceId[lensInstanceId] || [];
    assert.ok(warnings.some((warning) => warning.kind === "malformedCarrier"));
    assert.deepStrictEqual(derived.drafts.draftOrderByLensInstanceId[lensInstanceId] || [], []);
  } finally {
    resetResolveInputOverride();
  }
}

{
  let state = createEmptyAuthoritative();
  const laneId = state.workspace.laneOrder[0];
  const instances = [];
  for (let row = 0; row < 5; row += 1) {
    state = reduceAuthoritative(state, {
      type: ACTION_TYPES.LENS_ADD_TO_CELL,
      payload: { lensId: bulkLensId, laneId, row }
    });
    const lensInstanceId = state.workspace.grid.cells[`${laneId}:${row}`];
    assert.ok(lensInstanceId);
    state = reduceAuthoritative(state, {
      type: ACTION_TYPES.LENS_REPLACE_PARAMS,
      payload: { lensInstanceId, params: { count: 600 } }
    });
    instances.push(lensInstanceId);
  }
  const derived = recomputeDerived(state);
  const totalDrafts = Object.keys(derived.drafts.draftsById).length;
  assert.strictEqual(totalDrafts, DEFAULT_BATCH_CAPS.maxTotalDraftsPerRecompute);
  assert.strictEqual(derived.drafts.draftOrderByLensInstanceId[instances[0]].length, 600);
  assert.strictEqual(derived.drafts.draftOrderByLensInstanceId[instances[1]].length, 600);
  assert.strictEqual(derived.drafts.draftOrderByLensInstanceId[instances[2]].length, 600);
  const expectedFourth = DEFAULT_BATCH_CAPS.maxTotalDraftsPerRecompute - (600 * 3);
  assert.strictEqual(derived.drafts.draftOrderByLensInstanceId[instances[3]].length, expectedFourth);
  assert.strictEqual(derived.drafts.draftOrderByLensInstanceId[instances[4]].length, 0);
  const warnings = derived.runtimeWarningsByLensInstanceId[instances[3]] || [];
  assert.ok(warnings.some((warning) => warning.kind === "truncatedRecomputeOutputs"));
  const detailWarning = warnings.find((warning) => warning.kind === "truncatedRecomputeOutputs");
  assert.strictEqual(detailWarning.details.emitted, expectedFourth);
  assert.strictEqual(detailWarning.details.requested, 600);
}

console.log("batching caps tests ok");
