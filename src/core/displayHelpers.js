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
  return `${text.slice(0, maxLength)}...`;
}

export function flattenNumericTree(values) {
  const out = [];
  const walk = (node) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (Number.isFinite(node)) out.push(node);
  };
  walk(values);
  return out;
}

export function formatNumericTree(values, options = {}) {
  const { maxLength = 64 } = options;
  const render = (node) => {
    if (Array.isArray(node)) {
      return `[${node.map((child) => render(child)).join(",")}]`;
    }
    if (Number.isFinite(node)) {
      return `${node}`;
    }
    return "";
  };
  const text = render(values);
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}
