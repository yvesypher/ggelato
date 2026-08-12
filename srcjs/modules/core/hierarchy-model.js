/* Pure hierarchy data helpers shared by every widget and chart adapter. */

export const TOTAL_KEY = "__total__";
export const TOTAL_COLOR = "#e63946";
export const LEVEL_COLOR_STOPS = ["#f4a261", "#e9c46a", "#5495CFFF"];

const AGGREGATED_VALUES = new Set([
  "", "na", "nan", "n/a", "null", "undefined", "all", "total",
  "aggregate", "aggregated", "<aggregated>"
]);

export const escapeRegExp = value =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function dataFrameToRows(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (typeof data !== "object") return [];

  const keys = Object.keys(data);
  if (!keys.length) return [];
  const length = Array.isArray(data[keys[0]]) ? data[keys[0]].length : 0;
  return Array.from({ length }, (_, index) => Object.fromEntries(
    keys.map(key => [key, Array.isArray(data[key]) ? data[key][index] : null])
  ));
}

export function isAggregatedValue(value) {
  if (value == null) return true;
  const text = String(value)
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .trim()
    .toLowerCase();
  return AGGREGATED_VALUES.has(text) || text.includes("aggregated");
}

function interpolateRgb(startHex, endHex, amount) {
  const toRgb = hex => {
    const value = Number.parseInt(hex.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  };
  const start = toRgb(startHex);
  const end = toRgb(endHex);
  return `#${start.map((value, index) =>
    Math.round(value + (end[index] - value) * amount)
      .toString(16)
      .padStart(2, "0")
  ).join("")}`;
}

export function createDepthColors(levelCount) {
  if (levelCount <= LEVEL_COLOR_STOPS.length) {
    return [TOTAL_COLOR, ...LEVEL_COLOR_STOPS.slice(0, levelCount)];
  }
  const lastStop = LEVEL_COLOR_STOPS.length - 1;
  const levelColors = Array.from({ length: levelCount }, (_, index) => {
    const position = (index / (levelCount - 1)) * lastStop;
    const leftStop = Math.min(Math.floor(position), lastStop - 1);
    return interpolateRgb(
      LEVEL_COLOR_STOPS[leftStop],
      LEVEL_COLOR_STOPS[leftStop + 1],
      position - leftStop
    );
  });
  return [TOTAL_COLOR, ...levelColors];
}

export function parseStructure(structure) {
  const activeKeys = [];
  const constraints = [];
  const tokens = typeof structure === "string"
    ? structure.replace(/\s+/g, "").match(/[^/*()]+|[/*()]/g)
    : null;

  if (!tokens) return { activeKeys, constraints };
  let position = 0;

  function parseExpression() {
    let left = parseTerm();
    while (tokens[position] === "*") {
      position += 1;
      const right = parseTerm();
      left = {
        roots: [...left.roots, ...right.roots],
        leaves: [...left.leaves, ...right.leaves]
      };
    }
    return left;
  }

  function parseTerm() {
    let left = parseFactor();
    while (tokens[position] === "/") {
      position += 1;
      const right = parseFactor();
      left.leaves.forEach(parent => right.roots.forEach(child => {
        if (!constraints.some(rule => rule.parent === parent && rule.child === child)) {
          constraints.push({ parent, child });
        }
      }));
      left = { roots: left.roots, leaves: right.leaves };
    }
    return left;
  }

  function parseFactor() {
    if (tokens[position] === "(") {
      position += 1;
      const expression = parseExpression();
      if (tokens[position] === ")") position += 1;
      return expression;
    }
    const key = tokens[position++];
    if (!key) return { roots: [], leaves: [] };
    if (!activeKeys.includes(key)) activeKeys.push(key);
    return { roots: [key], leaves: [key] };
  }

  parseExpression();
  return { activeKeys, constraints };
}

export function isValidHierarchyOrder(keys, constraints) {
  return constraints.every(({ parent, child }) => {
    const parentIndex = keys.indexOf(parent);
    const childIndex = keys.indexOf(child);
    return parentIndex < 0 || childIndex < 0 || parentIndex < childIndex;
  });
}

export function requiredAncestors(keys, constraints) {
  const required = new Set();
  const pending = [...keys];
  while (pending.length) {
    const child = pending.pop();
    constraints.forEach(rule => {
      if (rule.child === child && !required.has(rule.parent)) {
        required.add(rule.parent);
        pending.push(rule.parent);
      }
    });
  }
  return required;
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
