/* Hierarchical series state shared by gig_point, gig_stldp and gig_sunburst. */

import {
  TOTAL_KEY,
  createDepthColors,
  isAggregatedValue,
  parseStructure
} from "../core/hierarchy-model.js";

const SEP = "\u0001";
const INTERNAL_TIME_ORDER = ".ggelato_time_order";

export { TOTAL_KEY };

export function resolveGigStructure(payload = {}) {
  return payload.structure ?? payload.hierarchy ?? null;
}

export function resolveGigValue(payload = {}) {
  return payload.value ?? payload.target ?? null;
}

export function timeSortValue(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const text = String(value).trim();
  if (!text) return null;
  let match = text.match(/^(\d{4})$/);
  if (match) return Date.UTC(Number(match[1]), 0, 1);

  match = text.match(/^(\d{4})\s*[-/]?\s*Q([1-4])$/i);
  if (match) return Date.UTC(Number(match[1]), (Number(match[2]) - 1) * 3, 1);
  match = text.match(/^Q([1-4])\s*[-/]?\s*(\d{4})$/i);
  if (match) return Date.UTC(Number(match[2]), (Number(match[1]) - 1) * 3, 1);

  match = text.match(/^(\d{4})\s*[-/]?\s*M(0?[1-9]|1[0-2])$/i);
  if (match) return Date.UTC(Number(match[1]), Number(match[2]) - 1, 1);

  match = text.match(/^(\d{4})\s*[-/]?\s*W(\d{1,2})$/i);
  if (match) {
    return Date.UTC(Number(match[1]), 0, 1) +
      (Number(match[2]) - 1) * 7 * 24 * 60 * 60 * 1000;
  }

  if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(text)) return Number(text);
  const dateText = text.replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T");
  const parsedDate = Date.parse(dateText);
  return Number.isFinite(parsedDate) ? parsedDate : null;
}

export function compareTimeRows(a, b, timeKey, orderKey = INTERNAL_TIME_ORDER) {
  const orderValue = row => {
    const raw = row?.[orderKey];
    if (raw == null || raw === "") return null;
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : null;
  };
  const aOrder = orderValue(a);
  const bOrder = orderValue(b);
  if (aOrder != null || bOrder != null) {
    if (aOrder == null) return 1;
    if (bOrder == null) return -1;
    if (aOrder !== bOrder) return aOrder - bOrder;
  }

  const aTime = timeSortValue(a?.[timeKey]);
  const bTime = timeSortValue(b?.[timeKey]);
  if (aTime != null || bTime != null) {
    if (aTime == null) return 1;
    if (bTime == null) return -1;
    if (aTime !== bTime) return aTime - bTime;
  }
  return String(a?.[timeKey] ?? "").localeCompare(
    String(b?.[timeKey] ?? ""),
    undefined,
    { numeric: true, sensitivity: "base" }
  );
}

export function resolveTimeColumn(rows, requested) {
  const keys = Object.keys(rows[0] || {});
  if (requested) {
    if (!keys.includes(requested)) {
      throw new Error(`Time column "${requested}" was not found in the data.`);
    }
    return requested;
  }

  const preferredNames = [
    "time", "date", "datetime", "timestamp", "index", ".index", "year",
    "yearmonth", "year_month", "month", "yearquarter", "year_quarter",
    "quarter", "yearweek", "year_week", "week", "day", "hour", "minute",
    "second"
  ];
  const keyByLowerName = new Map(keys.map(key => [key.toLowerCase(), key]));
  for (const name of preferredNames) {
    if (keyByLowerName.has(name)) return keyByLowerName.get(name);
  }

  const temporalStringKey = keys.find(key => {
    const values = rows
      .map(row => row[key])
      .filter(value => value != null && value !== "")
      .slice(0, 50);
    return values.length > 0 &&
      values.every(value => typeof value === "string") &&
      values.filter(value => timeSortValue(value) != null).length / values.length >= 0.9;
  });
  if (temporalStringKey) return temporalStringKey;

  throw new Error(
    "Could not infer the time column. Supply it explicitly with time = \"column\"."
  );
}

export function createHierState(rows, structure, excludeKeys) {
  excludeKeys = [...new Set([
    "Quarter", "Time", "Month", "Week", "Date", ".model",
    INTERNAL_TIME_ORDER,
    ...(excludeKeys || [])
  ])];
  const availableKeys = new Set();
  rows.forEach(row =>
    Object.keys(row || {}).forEach(key => availableKeys.add(key))
  );

  let allKeys;
  let activeKeys;
  let constraints;
  if (structure) {
    const parsed = parseStructure(structure);
    allKeys = parsed.activeKeys.filter(key => availableKeys.has(key));
    activeKeys = parsed.activeKeys.filter(key => allKeys.includes(key));
    constraints = parsed.constraints.filter(rule =>
      allKeys.includes(rule.parent) && allKeys.includes(rule.child)
    );
  } else {
    allKeys = [...availableKeys]
      .filter(key => !excludeKeys.includes(key))
      .filter(key => rows.some(row =>
        typeof row[key] === "string" && !isAggregatedValue(row[key])
      ))
      .sort();
    activeKeys = [...allKeys].sort((a, b) =>
      rows.filter(row => isAggregatedValue(row[a])).length -
      rows.filter(row => isAggregatedValue(row[b])).length
    );
    constraints = [];
  }

  const canonicalId = row => allKeys.map(key =>
    isAggregatedValue(row[key]) ? "AGG" : String(row[key]).trim()
  ).join("|");
  const seen = new Map();
  rows.forEach(row => {
    const id = canonicalId(row);
    if (!seen.has(id)) seen.set(id, row);
  });
  const seriesRows = [...seen.values()];

  const state = {
    allKeys,
    activeKeys,
    constraints,
    disabled: new Set(),
    hiddenValues: new Set(),
    canonicalId,
    series: [],

    displayKeys() {
      return this.activeKeys.filter(key => !this.disabled.has(key));
    },

    depthColor(depth) {
      const colors = createDepthColors(this.displayKeys().length);
      return colors[Math.max(0, Math.min(depth, colors.length - 1))];
    },

    isValidOrder(order) {
      return this.constraints.every(rule => {
        const parent = order.indexOf(rule.parent);
        const child = order.indexOf(rule.child);
        return parent < 0 || child < 0 || parent < child;
      });
    },

    isHidden(key, value) {
      return this.hiddenValues.has(`${key}${SEP}${value}`);
    },

    setHidden(key, value, hidden) {
      const id = `${key}${SEP}${value}`;
      hidden ? this.hiddenValues.add(id) : this.hiddenValues.delete(id);
    },

    toggleHidden(key, value) {
      this.setHidden(key, value, !this.isHidden(key, value));
    },

    hiddenCountFor(key) {
      let count = 0;
      this.hiddenValues.forEach(id => {
        if (id.split(SEP)[0] === key) count += 1;
      });
      return count;
    },

    showAllFor(key) {
      [...this.hiddenValues].forEach(id => {
        if (id.split(SEP)[0] === key) this.hiddenValues.delete(id);
      });
    },

    isSeriesHidden(series) {
      if (series._depth === 0 && this.isHidden(TOTAL_KEY, "Total")) return true;
      return this.activeKeys.some(key =>
        !isAggregatedValue(series[key]) &&
        this.isHidden(key, String(series[key]).trim())
      );
    },

    valuesForKey(key) {
      if (key === TOTAL_KEY) return ["Total"];
      const values = new Set();
      seriesRows.forEach(row => {
        if (!isAggregatedValue(row[key])) values.add(String(row[key]).trim());
      });
      return [...values].sort();
    },

    rebuild() {
      const displayKeys = this.displayKeys();
      const best = new Map();

      seriesRows.forEach(row => {
        let depth = displayKeys.length;
        for (let index = 0; index < displayKeys.length; index += 1) {
          if (isAggregatedValue(row[displayKeys[index]])) {
            depth = index;
            break;
          }
        }
        for (let index = depth; index < displayKeys.length; index += 1) {
          if (!isAggregatedValue(row[displayKeys[index]])) return;
        }

        const pathId = depth === 0
          ? "ROOT"
          : displayKeys.slice(0, depth).map(key => String(row[key]).trim()).join("|");
        const aggregateCount = this.allKeys.reduce((count, key) =>
          count + Number(isAggregatedValue(row[key])), 0
        );
        if (!best.has(pathId) || best.get(pathId).aggregateCount < aggregateCount) {
          best.set(pathId, {
            row,
            depth,
            pathId,
            aggregateCount,
            parentId: depth === 0
              ? null
              : (depth === 1
                ? "ROOT"
                : displayKeys.slice(0, depth - 1)
                  .map(key => String(row[key]).trim()).join("|")),
            canonicalId: this.canonicalId(row)
          });
        }
      });

      this.series = [...best.values()].map(item => ({
        ...item.row,
        _depth: item.depth,
        _id: item.pathId,
        _parentId: item.parentId,
        _canonicalId: item.canonicalId
      })).sort((a, b) => a._depth - b._depth);
      return this.series;
    },

    label(series) {
      if (series._depth === 0) return "Total";
      return series[this.displayKeys()[series._depth - 1]];
    }
  };

  state.rebuild();
  return state;
}
