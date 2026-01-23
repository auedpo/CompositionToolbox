/**
 * @typedef {"PitchList" | "Pattern"} MaterialType
 */

/**
 * @typedef {Object} PitchListData
 * @property {number[]} steps
 */

/**
 * @typedef {Object} MaterialReference
 * @property {number} edo
 * @property {number} refStep
 * @property {number} refHz
 * @property {string} [refLabel]
 */

/**
 * @typedef {Object} MaterialProvenance
 * @property {string} lensId
 * @property {string} [lensVersion]
 * @property {Object} params
 * @property {Object} [inputs]
 * @property {string} timestamp
 */

/**
 * @typedef {Object} Material
 * @property {string} id
 * @property {MaterialType} type
 * @property {string} name
 * @property {PitchListData|Object} data
 * @property {Object} meta
 * @property {MaterialReference} ref
 * @property {MaterialProvenance} provenance
 */

/**
 * @typedef {Object} MaterialDraft
 * @property {MaterialType} type
 * @property {PitchListData|Object} data
 * @property {Object} meta
 * @property {MaterialReference} ref
 * @property {MaterialProvenance} provenance
 */

export const MATERIAL_TYPES = {
  PitchList: "PitchList",
  Pattern: "Pattern"
};
