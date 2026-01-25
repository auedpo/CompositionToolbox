/**
 * @typedef {"PitchList" | "Pattern"} MaterialType
 */

/**
 * @typedef {Object} Draft
 * @property {string} draftId
 * @property {string} lensInstanceId
 * @property {string} type
 * @property {string} [subtype]
 * @property {any[]} payload
 * @property {string} summary
 * @property {Object} provenance
 * @property {number} createdAt
 */

/**
 * @typedef {Object} Material
 * @property {string} materialId
 * @property {MaterialType} type
 * @property {string} [subtype]
 * @property {string} name
 * @property {any[]} payload
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
