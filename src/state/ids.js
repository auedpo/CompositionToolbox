import { newId } from "../core/ids.js";

export function makeTrackId() {
  return newId("track");
}

export function makeLensInstanceId() {
  return newId("lens");
}

export function makeInventoryItemId() {
  return newId("item");
}

export function makeDeskNodeId() {
  return newId("desk");
}

export function makeDraftId() {
  return newId("draft");
}
