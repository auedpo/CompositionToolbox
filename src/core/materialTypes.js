/**
 * @typedef {"PitchList" | "Pattern"} MaterialType
 */

/**
 * @typedef {Object} PitchListData
 * @property {number[]} steps
 */

/**
 * @typedef {"binaryMask" | "indexMask" | "weights" | "order" | "curve"} PatternKind
 */

/**
 * @typedef {Object} PatternData
 * @property {PatternKind} kind
 * @property {number[]} values
 * @property {Object} [domain]
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
 * @property {string | number} timestamp
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
 * @property {string} type
 * @property {*} data
 * @property {Object} [meta]
 * @property {Object} [ref]
 * @property {Object} provenance
 */

/**
 * @typedef {Object} PatternProvenance
 * @property {string} lensId
 * @property {Object} params
 * @property {string[]} [inputs]
 * @property {number} timestamp
 */

/**
 * @typedef {Object} PatternDraft
 * @property {"Pattern"} type
 * @property {PatternData} data
 * @property {{ tags?: string[], units?: string, resolution?: number }} [meta]
 * @property {{ type: "pattern" }} [ref]
 * @property {PatternProvenance} provenance
 */

export const MATERIAL_TYPES = {
  PitchList: "PitchList",
  Pattern: "Pattern"
};
