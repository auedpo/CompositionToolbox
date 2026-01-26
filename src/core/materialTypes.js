/**
 * @typedef {"PitchList" | "Pattern"} MaterialType
 */

/**
 * @typedef {number | NumericTree[]} NumericTree
 */

/**
 * @typedef {Object} Draft
 * @property {string} draftId
 * @property {string} lensId
 * @property {string} lensInstanceId
 * @property {string} type
 * @property {string} [subtype]
 * @property {string} [summary]
 * @property {{ kind: "numericTree", values: NumericTree }} payload
 * @property {Object} [meta]
 */

/**
 * @typedef {Object} Material
 * @property {string} materialId
 * @property {MaterialType} type
 * @property {string} [subtype]
 * @property {string} name
 * @property {NumericTree} payload
 * @property {string} summary
 * @property {string[]} tags
 * @property {Object} meta
 * @property {Object} provenance
 * @property {number} createdAt
 */

/**
 * @typedef {Object} Clip
 * @property {string} clipId
 * @property {string} materialId
 * @property {number} laneId
 * @property {number} start
 * @property {number} duration
 * @property {Object|null} clipLocalTransforms
 * @property {number} createdAt
 */

export const MATERIAL_TYPES = {
  PitchList: "PitchList",
  Pattern: "Pattern"
};
