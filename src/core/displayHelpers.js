export function formatValueList(values, options = {}) {
  const { separator = " ", maxLength = 64 } = options;
  if (!Array.isArray(values) || !values.length) return "";
  const serialized = values.map((value) => {
    if (Number.isFinite(value)) {
      return value;
    }
    if (value === null || value === undefined) {
      return "";
    }
    return String(value);
  }).filter((value) => value !== "");
  if (!serialized.length) return "";
  const text = serialized.join(separator);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}
