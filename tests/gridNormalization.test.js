import assert from "node:assert/strict";
import { normalizeLensInstanceGridFields } from "../src/core/gridNormalization.js";

{
  const lensDef = {
    inputs: [
      { role: "primary" },
      { role: "secondary" }
    ]
  };
  const instance = {
    row: -5,
    selectedInputLaneByRole: {
      primary: "track-b",
      secondary: "missing"
    }
  };
  normalizeLensInstanceGridFields({
    instance,
    track: { id: "track-a" },
    indexInTrack: 2,
    lensDefinition: lensDef,
    laneIds: ["track-a", "track-b"]
  });
  assert.strictEqual(instance.row, 2, "Row coerces to the track index when missing or invalid");
  assert.deepStrictEqual(instance.selectedInputLaneByRole, {
    primary: "track-b",
    secondary: "auto"
  });
}

{
  const instance = {
    row: 0,
    selectedInputLaneByRole: {
      primary: "auto"
    }
  };
  normalizeLensInstanceGridFields({
    instance,
    track: { id: "track-a" },
    indexInTrack: 0,
    lensDefinition: { inputs: [{ role: "primary" }] },
    laneIds: ["track-a"]
  });
  assert.strictEqual(instance.row, 0, "Row remains valid when already set");
  assert.deepStrictEqual(instance.selectedInputLaneByRole, { primary: "auto" });
}

console.log("gridNormalization tests ok");
