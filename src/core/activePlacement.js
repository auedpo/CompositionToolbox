import { state } from "../state.js";

export function getFocusedIntervalPlacementInstance() {
  const id = state.focusedIntervalPlacementId;
  if (!id) return null;
  return state.lensInstancesById.get(id) || null;
}

export function getFocusedIntervalPlacementDraft() {
  const instance = getFocusedIntervalPlacementInstance();
  if (!instance) return null;
  if (instance.activeDraft) return instance.activeDraft;
  const index = Number.isFinite(instance.activeDraftIndex) ? instance.activeDraftIndex : 0;
  const drafts = Array.isArray(instance.currentDrafts) ? instance.currentDrafts : [];
  return drafts[index] || null;
}

export function getFocusedIntervalPlacementRecord() {
  const instance = getFocusedIntervalPlacementInstance();
  if (!instance) return null;
  const viz = instance.evaluateResult && instance.evaluateResult.vizModel;
  if (!viz) return null;
  const index = Number.isFinite(instance.activeDraftIndex) ? instance.activeDraftIndex : 0;
  const records = Array.isArray(viz.records) ? viz.records : [];
  return records[index] || null;
}
