// Purpose: transformerPipeline.js provides exports: ensureDefaultSignalFlowSelections, INPUT_SOURCE_AUTO, INPUT_SOURCE_LANE, updateLivePortRef.
// Interacts with: imports: ./core/laneRowRouting.js, ./lenses/inputResolution.js.
// Role: module module within the broader app graph.
import { isFreezeRef } from "./lenses/inputResolution.js";
import {
  buildLaneRowIndex,
  findNearestUpstreamLens,
  resolveSourceLaneId
} from "./core/laneRowRouting.js";

/*
 * Lane/row terminology (Phase 0 doc + scaffolding):
 * - Lane: a vertical signal column that matches an existing "track".
 * - Row: a vertical position index within a lane; higher rows are downstream.
 * - Auto input: the default behavior where a lens pulls from the nearest upstream lens in the same lane.
 * - Lane-based input: a future mode where a lens selects a source lane and implicitly pulls from the nearest upstream lens in that lane above its own row.
 * - Upstream: any lens instance sharing the lane whose row index is strictly less than the target.
 * Routing is lane- and row-based, not graph-based.
 * Active drafts are always used as upstream outputs, and compatibility is assumed (all drafts are lists).
 */

export const INPUT_SOURCE_AUTO = "auto";
export const INPUT_SOURCE_LANE = "lane";

export function updateLivePortRef(instance, sourceInstance, role, scheduleLens) {
  if (!instance || !sourceInstance || !role) return;
  const draft = sourceInstance.activeDraft || null;
  const draftId = draft ? (draft.draftId || draft.id || null) : null;
  const sourceLensInstanceId = sourceInstance.lensInstanceId || sourceInstance.id || null;
  const sourceToken = sourceInstance._updateToken || 0;
  const lastLiveIds = instance._lastLiveDraftIdByRole || {};
  const lastId = lastLiveIds[role] || null;
  const lastToken = (instance._liveSourceTokens && instance._liveSourceTokens[role]) || null;
  const changed = lastId !== draftId || lastToken !== sourceToken;

  instance._lastLiveDraftIdByRole = instance._lastLiveDraftIdByRole || {};
  instance._lastLiveDraftIdByRole[role] = draftId;
  instance._liveInputRefs = instance._liveInputRefs || {};
  instance._liveInputRefs[role] = {
    mode: "active",
    sourceLensInstanceId
  };
  instance._liveInputSource = instance._liveInputSource || {};
  instance._liveInputSource[role] = sourceLensInstanceId;
  instance._liveSourceTokens = instance._liveSourceTokens || {};
  instance._liveSourceTokens[role] = sourceToken;
  instance.selectedInputRefsByRole = instance.selectedInputRefsByRole || {};
  instance.selectedInputRefsByRole[role] = {
    mode: "active",
    sourceLensInstanceId
  };

  if (changed && draftId && typeof scheduleLens === "function") {
    scheduleLens(instance);
  }
}

function clearLivePortRef(instance, role, scheduleLens) {
  if (!instance || !role) return;
  const lastLive = instance._liveInputRefs && instance._liveInputRefs[role];
  if (!lastLive) return;
  const selectedRef = instance.selectedInputRefsByRole && instance.selectedInputRefsByRole[role];
  const isAutoSelected = !selectedRef ||
    (typeof selectedRef === "object"
      && selectedRef.mode === "active"
      && selectedRef.sourceLensInstanceId === lastLive.sourceLensInstanceId);
  if (!isAutoSelected) return;
  if (instance._lastLiveDraftIdByRole) {
    delete instance._lastLiveDraftIdByRole[role];
  }
  if (instance._liveInputRefs) {
    delete instance._liveInputRefs[role];
  }
  if (instance._liveInputSource) {
    delete instance._liveInputSource[role];
  }
  if (instance._liveSourceTokens) {
    delete instance._liveSourceTokens[role];
  }
  if (instance.selectedInputRefsByRole) {
    delete instance.selectedInputRefsByRole[role];
  }
  if (typeof scheduleLens === "function") {
    scheduleLens(instance);
  }
}

function hasManualInputFallback(spec) {
  return Boolean(spec && typeof spec.fallbackLiteralKey === "string");
}

function formatMissingUpstreamMessage({ sourceLaneId, targetRow }) {
  const laneText = sourceLaneId ? `lane "${sourceLaneId}"` : "selected lane";
  const rowText = Number.isFinite(targetRow) ? targetRow : "current position";
  return `No upstream in ${laneText} above row ${rowText}. Move this lens down or change input lane.`;
}

function setMissingUpstream(instance, role, info, scheduleLens) {
  if (!instance || !role || !info || !info.message) return;
  instance._missingUpstreamByRole = instance._missingUpstreamByRole || {};
  const previous = instance._missingUpstreamByRole[role];
  const sameMessage = previous && previous.message === info.message;
  instance._missingUpstreamByRole[role] = info;
  if (!sameMessage && typeof scheduleLens === "function") {
    scheduleLens(instance);
  }
}

function clearMissingUpstream(instance, role) {
  if (!instance || !role || !instance._missingUpstreamByRole) return;
  delete instance._missingUpstreamByRole[role];
  if (!Object.keys(instance._missingUpstreamByRole).length) {
    delete instance._missingUpstreamByRole;
  }
}

export function ensureDefaultSignalFlowSelections(
  tracks,
  lensInstances,
  scheduleLens,
  options = {}
) {
  // WS2 hover thrash fix: avoid clearing missing-upstream state on every pass,
  // which caused setMissingUpstream() to re-schedule lenses in a tight loop.
  if (!Array.isArray(tracks)) return;
  const workspace2 = options && options.workspace2;
  if (!workspace2) {
    tracks.forEach((track) => {
      const lensIds = Array.isArray(track && track.lensInstanceIds)
        ? track.lensInstanceIds
        : [];
      lensIds.forEach((instanceId) => {
        const instance = lensInstances.get(instanceId);
        if (!instance) return;
        const inputSpecs = Array.isArray(instance.lens && instance.lens.inputs)
          ? instance.lens.inputs
          : [];
        if (!inputSpecs.length) return;
        const upstream = findPreviousSibling(track, instance, lensInstances);
        if (!upstream) return;
        inputSpecs.forEach((spec) => {
          const role = spec && spec.role;
          if (!role || spec.allowUpstream === false) return;
          const selected = instance.selectedInputRefsByRole
            ? instance.selectedInputRefsByRole[role]
            : null;
          if (isFreezeRef(selected)) return;
          const activeSourceId = selected && selected.sourceLensInstanceId
            ? selected.sourceLensInstanceId
            : null;
          const isActiveOther = upstream && activeSourceId && activeSourceId !== upstream.lensInstanceId;
          if (isActiveOther) return;
          updateLivePortRef(instance, upstream, role, scheduleLens);
        });
      });
    });
    return;
  }

  const laneIndex = buildLaneRowIndex({
    tracks,
    lensInstancesById: lensInstances
  });

  tracks.forEach((track) => {
    const lensIds = Array.isArray(track && track.lensInstanceIds)
      ? track.lensInstanceIds
      : [];
    const targetLaneId = track && typeof track.id === "string" ? track.id : null;
    lensIds.forEach((instanceId) => {
      const instance = lensInstances.get(instanceId);
      if (!instance) return;
      const inputSpecs = Array.isArray(instance.lens && instance.lens.inputs)
        ? instance.lens.inputs
        : [];
      if (!inputSpecs.length) return;
      const searchRow = Number.isFinite(instance.row)
        ? instance.row
        : Number.MAX_SAFE_INTEGER;
      const reportedRow = Number.isFinite(instance.row)
        ? instance.row
        : null;
      inputSpecs.forEach((spec) => {
        const role = spec && spec.role;
        if (!role) return;
        if (spec.allowUpstream === false) {
          clearMissingUpstream(instance, role);
          clearLivePortRef(instance, role, scheduleLens);
          return;
        }
        const selected = instance.selectedInputRefsByRole
          ? instance.selectedInputRefsByRole[role]
          : null;
        if (isFreezeRef(selected)) return;
        const liveRef = instance._liveInputRefs && instance._liveInputRefs[role];
        const activeSourceId = selected && selected.sourceLensInstanceId
          ? selected.sourceLensInstanceId
          : null;
        const isManualActive = Boolean(
          activeSourceId &&
          (!liveRef || liveRef.sourceLensInstanceId !== activeSourceId)
        );
        const laneSelection = instance.selectedInputLaneByRole && typeof instance.selectedInputLaneByRole === "object"
          ? instance.selectedInputLaneByRole[role]
          : null;
        const normalizedSelection = typeof laneSelection === "string"
          ? laneSelection
          : INPUT_SOURCE_AUTO;
        const sourceLaneId = resolveSourceLaneId({
          index: laneIndex,
          targetLaneId,
          selection: normalizedSelection
        });
        const upstreamLensInstanceId = findNearestUpstreamLens({
          index: laneIndex,
          sourceLaneId,
          targetRow: searchRow
        });
        if (!upstreamLensInstanceId) {
          if (spec.required !== false && !hasManualInputFallback(spec)) {
            const message = formatMissingUpstreamMessage({
              sourceLaneId,
              targetRow: reportedRow
            });
            setMissingUpstream(
              instance,
              role,
              {
                sourceLaneId,
                targetRow: reportedRow,
                message
              },
              scheduleLens
            );
          } else {
            clearMissingUpstream(instance, role);
          }
          clearLivePortRef(instance, role, scheduleLens);
          return;
        }
        const upstream = lensInstances.get(upstreamLensInstanceId);
        if (!upstream) {
          clearLivePortRef(instance, role, scheduleLens);
          return;
        }
        clearMissingUpstream(instance, role);
        if (isManualActive && upstream && activeSourceId !== upstream.lensInstanceId) return;
        updateLivePortRef(instance, upstream, role, scheduleLens);
      });
    });
  });
}

function getParentPath(path) {
  if (!Array.isArray(path) || !path.length) return [];
  return path.slice(0, -1);
}

function hasSameParentPath(pathA, pathB) {
  const parentA = getParentPath(pathA);
  const parentB = getParentPath(pathB);
  if (parentA.length !== parentB.length) return false;
  return parentA.every((value, index) => value === parentB[index]);
}

function findPreviousSibling(track, instance, lensInstances) {
  if (!track || !instance) return null;
  const ordered = Array.isArray(track.lensInstanceIds) ? track.lensInstanceIds : [];
  const targetPath = Array.isArray(instance.path) ? instance.path : [];
  let previous = null;
  for (const lensId of ordered) {
    const candidate = lensInstances.get(lensId);
    if (!candidate) continue;
    const candidatePath = Array.isArray(candidate.path) ? candidate.path : [];
    if (!hasSameParentPath(candidatePath, targetPath)) continue;
    if (candidate.lensInstanceId === instance.lensInstanceId) {
      return previous;
    }
    previous = candidate;
  }
  return null;
}
