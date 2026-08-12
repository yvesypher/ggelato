import {
    createDepthColors,
    escapeHtml,
    escapeRegExp,
    isAggregatedValue,
    requiredAncestors
} from "../modules/core/hierarchy-model.js";
import { createHierarchyWidget } from "../modules/core/hierarchy-widget.js";
import {
    attachHierarchyWidgetResize,
    createHierarchyWidgetDocking
} from "../modules/core/floating-widget.js";
import {
    createValueControls,
    hasAnyValues
} from "../modules/core/value-menu.js";

export { isAggregatedValue };

// Only the tooltip keeps hc-specific class names (styled in add_hierarchy_hc.css);
// Widget classes come from hierarchy-core and are styled by hierarchy-core.css.
const TOOLTIP_PREFIX = "hierarchy-hc";
const TOTAL_NAME_PATTERN = /^(total|all|aggregate|aggregated)$/i;
const GENERIC_Y_AXIS_TITLES = new Set(["value", "values", "y"]);
const GENERIC_X_AXIS_TITLES = new Set(["x", "category", "categories"]);
const MUTED_SERIES_COLOR = "#cbd5e1";
export const HIERARCHY_HC_BUILD = "2026-07-19-cumulative-display-path-v8";
const POINT_METADATA_KEYS = new Set([
    "x", "y", "z", "value", "name", "id", "color", "custom", "marker",
    "selected", "series", "category", "percentage", "total"
]);

const seriesInfoCache = new WeakMap();
const chartCache = new WeakMap();
let decoder = null;

function decodeHtml(value) {
    if (!decoder) decoder = document.createElement("textarea");
    decoder.innerHTML = String(value);
    return decoder.value;
}

/* ---------- chart lookup ---------- */

function getHighchartsChart(el) {
    if (!window.Highcharts || !Highcharts.charts) return null;

    const cached = chartCache.get(el);
    if (cached && Highcharts.charts[cached.index] === cached) return cached;

    const charts = Highcharts.charts.filter(Boolean);
    for (let i = charts.length - 1; i >= 0; i--) {
        const chart = charts[i];
        const target = chart && chart.renderTo;
        if (target && (target === el || el.contains(target) || target.contains(el))) {
            chartCache.set(el, chart);
            return chart;
        }
    }
    return null;
}

/* ---------- hierarchy extraction (exported for tests) ---------- */

function getCaseInsensitive(obj, key) {
    if (!obj || typeof obj !== "object") return undefined;
    if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
    const wanted = String(key).toLowerCase();
    for (const candidate in obj) {
        if (String(candidate).toLowerCase() === wanted) return obj[candidate];
    }
    return undefined;
}

function getSeriesTextBlob(series) {
    const userOptions = series.userOptions || {};
    const options = series.options || {};
    const pieces = [
        series.name, userOptions.name, options.name,
        userOptions.id, options.id
    ].filter(Boolean);

    [userOptions.custom, options.custom].forEach(custom => {
        if (!custom) return;
        try { pieces.push(JSON.stringify(custom)); } catch (e) { /* ignore */ }
    });

    return decodeHtml(pieces.join("; "))
        .replace(/<br\s*\/?>/gi, "; ")
        .replace(/\n/g, "; ");
}

function findHierarchyValueInText(text, key) {
    const pattern = new RegExp(
        "(^|[;|,\\s])" + escapeRegExp(key) + "\\s*[:=]\\s*([^;|,\\n]+)",
        "i"
    );
    const match = text.match(pattern);
    return match ? match[2].trim() : undefined;
}

export function extractHierarchyFromSeries(series, allKeys) {
    const userOptions = series.userOptions || {};
    const options = series.options || {};
    const firstPointOptions = series.points?.[0]?.options || series.data?.[0]?.options;
    const firstPointCustom = firstPointOptions?.custom;
    const rawData = userOptions.data ?? options.data;
    let firstRawPoint = Array.isArray(rawData) ? rawData[0] : rawData;
    if (typeof firstRawPoint === "string" && /^[{[]/.test(firstRawPoint.trim())) {
        try {
            const parsed = JSON.parse(firstRawPoint);
            firstRawPoint = Array.isArray(parsed) ? parsed[0] : parsed;
        } catch (error) { /* ignore */ }
    }
    const out = {};
    let found = false;

    const candidates = [
        userOptions.custom?.hierarchy,
        options.custom?.hierarchy,
        userOptions.custom,
        options.custom,
        userOptions,
        options,
        firstPointOptions?.hierarchy,
        firstPointOptions,
        firstPointCustom?.hierarchy,
        firstPointCustom,
        firstRawPoint?.hierarchy,
        firstRawPoint
    ];

    candidates.forEach(source => {
        if (!source || typeof source !== "object") return;
        allKeys.forEach(key => {
            if (out[key] !== undefined) return;
            const value = getCaseInsensitive(source, key);
            if (value !== undefined) {
                out[key] = value;
                found = true;
            }
        });
    });

    if (!found || allKeys.some(key => out[key] === undefined)) {
        const textBlob = getSeriesTextBlob(series);
        allKeys.forEach(key => {
            if (out[key] !== undefined) return;
            const value = findHierarchyValueInText(textBlob, key);
            if (value !== undefined) {
                out[key] = value;
                found = true;
            }
        });
    }

    if (!found || allKeys.some(key => out[key] === undefined)) {
        const seriesName = decodeHtml(
            series.name || userOptions.name || options.name || ""
        ).trim();

        if (TOTAL_NAME_PATTERN.test(seriesName)) {
            allKeys.forEach(key => { out[key] = "<aggregated>"; });
            return out;
        }

        let parts = seriesName
            .split(/\s*(?:\/|\||›|→|»)\s*/)
            .map(part => part.trim())
            .filter(Boolean);

        // hcaes(group = interaction(...)) normally produces dot-separated
        // Highcharts series names. Use those parts when all hierarchy levels
        // are represented.
        const dotParts = seriesName.split(".").map(part => part.trim());
        if (dotParts.length === allKeys.length) parts = dotParts;

        // A bare Highcharts group id such as "1" is not hierarchy metadata.
        // Only positional names that represent every key are safe to map;
        // partial hierarchies must use explicit key:value metadata.
        if (parts.length === allKeys.length) {
            parts.forEach((part, index) => {
                if (out[allKeys[index]] === undefined) out[allKeys[index]] = part;
            });
            found = true;
        }
    }

    if (!found) return null;

    allKeys.forEach(key => {
        if (out[key] === undefined) out[key] = "<aggregated>";
    });
    return out;
}

// Hierarchy values and their aggregation flags are static per series, so
// compute them once; only depth/validity depend on the displayed keys.
export function getSeriesInfo(series, allKeys) {
    if (seriesInfoCache.has(series)) return seriesInfoCache.get(series);

    const hierarchy = extractHierarchyFromSeries(series, allKeys);
    let info = null;
    if (hierarchy) {
        const isAggregated = {};
        allKeys.forEach(key => { isAggregated[key] = isAggregatedValue(hierarchy[key]); });
        info = { hierarchy, isAggregated };
    }
    // Do not memoize a miss. Highcharts can construct points lazily, and a
    // lookup made before point options exist must be allowed to succeed later.
    if (info) seriesInfoCache.set(series, info);
    return info;
}

/* ---------- classification and styling (exported for tests) ---------- */

export function classifySeries(series, displayKeys, allKeys, constraints = []) {
    const info = getSeriesInfo(series, allKeys);
    if (!info) return null;

    const { isAggregated } = info;
    let activeDepth = 0;
    displayKeys.forEach((key, index) => {
        if (!isAggregated[key]) activeDepth = index + 1;
    });

    // The displayed order defines one cumulative aggregation path. At depth d,
    // exactly the first d displayed keys must be concrete and every later key
    // must be aggregated. Thus State/Purpose/Region displays only
    // Total -> State -> State*Purpose -> State*Purpose*Region.
    const displayedPrefixIsValid = displayKeys.every((key, index) =>
        index < activeDepth ? !isAggregated[key] : isAggregated[key]
    );

    // A hidden nested ancestor must remain concrete so a displayed child can
    // still identify a real branch. Other hidden keys must be aggregated.
    // Example: if State is hidden while Region is displayed, a Region-level
    // series still carries its concrete State value; a crossed hidden key does
    // not. This is why the structure constraints are needed during filtering.
    const concretePrefix = displayKeys.slice(0, activeDepth);
    const hiddenAncestors = requiredAncestors(concretePrefix, constraints);
    const hiddenKeysAreValid = allKeys.every(key => {
        if (displayKeys.includes(key)) return true;
        return hiddenAncestors.has(key)
            ? !isAggregated[key]
            : isAggregated[key];
    });

    return {
        valid: displayedPrefixIsValid && hiddenKeysAreValid,
        activeDepth,
        hierarchy: info.hierarchy,
        // Value selection and visibility controls consume the same flags.
        // Keeping them on the classification result prevents the update loop
        // from failing after the first matching series.
        isAggregated
    };
}

export function updateHighchartSeries(
    chart,
    displayKeys,
    allKeys,
    constraints,
    totalVisible = true,
    fitData = false,
    interaction = null
) {
    if (!chart || !chart.series) return;

    const depthColors = createDepthColors(displayKeys.length);
    let matched = 0;
    const hasSelection = Boolean(interaction?.hasSelection?.());

    const renderedStyles = [];
    // Series.update() can internally remove and reinsert a series. Iterate a
    // snapshot so Highcharts cannot skip later series while the array changes.
    [...chart.series].forEach(series => {
        if (!series || !series.options || series.options.isInternal) return;

        const info = classifySeries(series, displayKeys, allKeys, constraints);
        if (!info) return;
        matched++;

        const visible = info.valid &&
            (info.activeDepth !== 0 || totalVisible) &&
            !interaction?.isHidden?.(series, info);
        const depth = info.activeDepth;
        const selected = hasSelection && Boolean(
            interaction?.isSelected?.(series, info, depth, displayKeys)
        );

        const opacity = hasSelection
            ? (selected ? 1 : 0.15)
            : (depth === displayKeys.length ? 0.65 : 1);
        const color = hasSelection && !selected
            ? MUTED_SERIES_COLOR
            : depthColors[depth];
        const lineWidth = hasSelection
            ? (selected ? 3 : 1)
            : (depth === 0 ? 4 : depth === displayKeys.length ? 1.2 : 2.5);

        // Skip the expensive update when the logical style is unchanged, but
        // repaint its current SVG path after redraw in case a Highcharts theme
        // or layout update recreated that path with its old colorIndex.
        const styleKey = [
            visible, depth, displayKeys.length, hasSelection, selected
        ].join("|");
        if (series.__hierarchyStyleKey === styleKey) {
            if (visible) renderedStyles.push({ series, color, lineWidth, opacity });
            return;
        }
        series.__hierarchyStyleKey = styleKey;

        series.setVisible(visible, false);
        if (visible) {
            series.update({
                color,
                lineWidth,
                opacity: opacity,
                marker: { enabled: false, states: { hover: { enabled: true } } }
            }, false);
            // Keep all three Highcharts option layers aligned. This also
            // protects the hierarchy colour when another chart update causes
            // the SVG path to be regenerated.
            series.color = color;
            if (series.options) series.options.color = color;
            if (series.userOptions) series.userOptions.color = color;
            if (series.group) series.group.attr({ opacity });
            renderedStyles.push({ series, color, lineWidth, opacity });
        }
    });

    if (matched === 0 && !chart.__hierarchyWarned) {
        chart.__hierarchyWarned = true;
        console.warn(
            "add_hierarchy_hc(): No Highcharts series contained hierarchy metadata. " +
            "Use series custom.hierarchy, key:value names, or slash-separated names."
        );
    }

    if (fitData) {
        [...(chart.xAxis || []), ...(chart.yAxis || [])].forEach(axis => {
            axis.setExtremes(null, null, false, false);
        });
    }

    chart.redraw();

    // In Highcharts styled mode, or when a theme supplies per-series CSS,
    // setting the series option alone may leave the existing path coloured by
    // its old colorIndex class. Inline style is the final, deterministic
    // hierarchy-colour layer for the rendered graph.
    renderedStyles.forEach(({ series, color, lineWidth, opacity }) => {
        series.graph?.attr({
            stroke: color,
            "stroke-width": lineWidth,
            opacity
        });
        series.group?.element
            ?.querySelectorAll?.(".highcharts-graph")
            .forEach(path => {
                path.style.stroke = color;
                path.style.strokeWidth = String(lineWidth);
                path.style.opacity = String(opacity);
            });
    });
}

/* ---------- tooltip ---------- */

const cleanHierarchyValue = value => isAggregatedValue(value) ? "All" : String(value);

const formatNumericValue = value =>
    (window.Highcharts && Highcharts.numberFormat && typeof value === "number")
        ? Highcharts.numberFormat(value, 0, ".", ",")
        : value;

const usableAxisTitle = (title, genericTitles) => {
    const text = title == null ? "" : String(title).trim();
    return text && !genericTitles.has(text.toLowerCase()) ? text : null;
};

function getPoint(pointContext) {
    return pointContext?.point || pointContext;
}

function comparableScalar(value) {
    if (value == null) return value;
    if (typeof value === "object" && typeof value.valueOf === "function") {
        const primitive = value.valueOf();
        if (primitive !== value) return primitive;
    }
    return value;
}

function samePointValue(candidate, target) {
    candidate = comparableScalar(candidate);
    target = comparableScalar(target);
    if (candidate === target) return true;

    // Highcharter may serialize an original numeric field as a numeric string.
    if (candidate !== "" && target !== "" &&
        Number.isFinite(Number(candidate)) && Number.isFinite(Number(target))) {
        return Number(candidate) === Number(target);
    }
    return false;
}

export function inferPointFieldName(pointContext, coordinate, allKeys) {
    const point = getPoint(pointContext);
    const target = point?.[coordinate] ?? pointContext?.[coordinate];
    if (target == null) return null;

    const rawSeriesPoint = point?.series?.userOptions?.data?.[point.index]
        || point?.series?.options?.data?.[point.index];
    const sources = [point?.options, point?.userOptions, rawSeriesPoint];
    const hierarchyKeys = new Set((allKeys || []).map(key => String(key).toLowerCase()));

    for (const source of sources) {
        if (!source || typeof source !== "object" || Array.isArray(source)) continue;
        for (const [name, value] of Object.entries(source)) {
            const lowerName = String(name).toLowerCase();
            if (POINT_METADATA_KEYS.has(lowerName) || hierarchyKeys.has(lowerName)) continue;
            if (samePointValue(value, target)) return String(name);
        }
    }
    return null;
}

function getXAxisValueName(pointContext, x, allKeys) {
    const inferred = inferPointFieldName(pointContext, "x", allKeys);
    if (inferred) return inferred;

    const explicit = x?.hierarchy_x_name;
    if (explicit && String(explicit).trim() !== "") return String(explicit);

    const axis = getPoint(pointContext)?.series?.xAxis || pointContext?.series?.xAxis;
    return usableAxisTitle(axis?.options?.title?.text, GENERIC_X_AXIS_TITLES)
        || usableAxisTitle(axis?.axisTitle?.textStr, GENERIC_X_AXIS_TITLES)
        || "X";
}

function getYAxisValueName(pointContext, x, allKeys) {
    const inferred = inferPointFieldName(pointContext, "y", allKeys);
    if (inferred) return inferred;

    const explicit = x?.hierarchy_value_name;
    if (explicit && String(explicit).trim() !== "") return String(explicit);

    const axis = getPoint(pointContext)?.series?.yAxis || pointContext?.series?.yAxis;
    return usableAxisTitle(axis?.options?.title?.text, GENERIC_Y_AXIS_TITLES)
        || usableAxisTitle(axis?.axisTitle?.textStr, GENERIC_Y_AXIS_TITLES)
        || "Value";
}

function formatDateValue(value, granularity) {
    // Native Highcharts datetime values are milliseconds; R date-like values
    // on a linear axis are day-numbers.
    const multiplier = granularity === "datetime" ? 1 : 86400000;
    const date = new Date(Math.round(value) * multiplier);
    if (!Number.isFinite(date.getTime())) return String(value);

    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    if (granularity === "quarter") {
        return `${year} Q${Math.floor(month / 3) + 1}`;
    }
    if (granularity === "month") {
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${year} ${months[month]}`;
    }
    if (granularity === "year") return String(year);
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function getXValue(pointContext, x) {
    const point = getPoint(pointContext);
    const axis = point?.series?.xAxis || pointContext?.series?.xAxis;
    const raw = point?.x ?? pointContext?.x ?? pointContext?.key;

    // Categories can be strings, factors, or any user-supplied labels.
    if (axis?.categories && raw != null && axis.categories[raw] !== undefined) {
        return axis.categories[raw];
    }
    if (point?.category != null && point.category !== raw) return point.category;

    // R Dates are serialized as day-numbers on a linear axis. The R adapter
    // records their detected/requested granularity for an exact tooltip label.
    const granularity = x?.hierarchy_time_granularity;
    if (granularity && granularity !== "none" && typeof raw === "number") {
        return formatDateValue(raw, granularity);
    }

    // Native Highcharts datetime axes use JavaScript milliseconds.
    if (axis?.options?.type === "datetime" && typeof raw === "number") {
        return formatDateValue(raw, "datetime");
    }

    // Honour a custom axis label formatter for other axis types when one is
    // present, while falling back safely for plain numeric data.
    const formatter = axis?.options?.labels?.formatter;
    if (typeof formatter === "function") {
        try {
            const formatted = formatter.call({
                axis,
                chart: axis.chart,
                value: raw,
                pos: raw,
                isFirst: false,
                isLast: false
            });
            if (formatted != null && formatted !== "") return formatted;
        } catch (error) { /* use the raw value below */ }
    }

    return raw == null ? "" : raw;
}

function makeHierarchyTooltip(pointContext, orderedKeys, allKeys, x) {
    const point = getPoint(pointContext);
    const info = getSeriesInfo(point.series, allKeys);
    const xName = getXAxisValueName(pointContext, x, allKeys);
    const xValue = getXValue(pointContext, x);
    const valueName = getYAxisValueName(pointContext, x, allKeys);

    const rows = [];
    if (info) {
        orderedKeys.forEach(key => {
            rows.push(
                `<tr><td class="${TOOLTIP_PREFIX}-tooltip-key">${escapeHtml(key)}</td>` +
                `<td class="${TOOLTIP_PREFIX}-tooltip-value">${escapeHtml(cleanHierarchyValue(info.hierarchy[key]))}</td></tr>`
            );
        });
    }
    rows.push(
        `<tr><td class="${TOOLTIP_PREFIX}-tooltip-key">${escapeHtml(xName)}</td>` +
        `<td class="${TOOLTIP_PREFIX}-tooltip-value">${escapeHtml(xValue)}</td></tr>`
    );
    rows.push(
        `<tr><td class="${TOOLTIP_PREFIX}-tooltip-key">${escapeHtml(valueName)}</td>` +
        `<td class="${TOOLTIP_PREFIX}-tooltip-number">${escapeHtml(formatNumericValue(point.y))}</td></tr>`
    );

    return `<div class="${TOOLTIP_PREFIX}-tooltip"><table class="${TOOLTIP_PREFIX}-tooltip-table">${rows.join("")}</table></div>`;
}

// Only the tooltip needs runtime state (series hierarchy and current key
// order); legend and axis labels are configured R-side.
function installHierarchyHighchartsOptions(chart, getOrderedKeys, allKeys, x) {
    if (!chart || chart.__hierarchyHcOptionsInstalled) return;
    chart.__hierarchyHcOptionsInstalled = true;

    chart.update({
        tooltip: {
            useHTML: true,
            shared: false,
            headerFormat: "",
            formatter: function () {
                return makeHierarchyTooltip(this, getOrderedKeys(), allKeys, x);
            }
        }
    }, false);
}

/* ---------- widget entry ---------- */

window.init_hierarchy_hc = function (el, x) {
    if (!el || !x || !x.hierarchy_structure) return;

    el.dataset.hierarchyHcBuild = HIERARCHY_HC_BUILD;

    el.__hierarchyHcCleanup?.();

    const controller = new AbortController();
    const { signal } = controller;
    const removeHierarchyWidgets = () => el
        .querySelectorAll(".hierarchy-addon-container")
        .forEach(node => node.remove());

    removeHierarchyWidgets();
    el.__hierarchyHcCleanup = () => {
        controller.abort();
        removeHierarchyWidgets();
    };

    el.style.overflow = "visible";

    /* edge docking via chart spacing (which sits outside axis labels, so a
       docked widget never overlaps axis text). Dock mechanics come from the
       shared createHierarchyWidgetDocking; this adapter only supplies applySpace. */
    const SPACING_DEFAULTS = { top: 10, right: 10, bottom: 15, left: 10 };
    const spacingKey = side => "spacing" + side[0].toUpperCase() + side.slice(1);
    let docking = null;
    let initialDockApplied = false;
    let hierarchyKeys = [];

    // All observations start selected; only explicit deselections are stored.
    const deselectedValues = new Map();
    const hiddenValues = new Map();
    const valueInteraction = {
        hasSelection: () => hasAnyValues(deselectedValues),
        isHidden: (_series, info) => hierarchyKeys.some(key =>
            !info.isAggregated[key] &&
            hiddenValues.get(key)?.has(String(info.hierarchy[key]))
        ),
        isSelected: (_series, info, depth) => {
            if (depth === 0) {
                return !deselectedValues.get("__total__")?.has("Total");
            }
            // A level value represents every descendant observation carrying
            // that value. For example, deselecting State = Queensland also
            // mutes its Region- and Purpose-level series.
            return !hierarchyKeys.some(key =>
                !info.isAggregated[key] &&
                deselectedValues.get(key)?.has(String(info.hierarchy[key]))
            );
        }
    };

    const valueControls = createValueControls({
        deselectedValues,
        hiddenValues,
        getValues: key => {
            const chart = getHighchartsChart(el);
            const values = new Set();
            (chart?.series || []).forEach(series => {
                if (series?.options?.isInternal) return;
                const info = getSeriesInfo(series, hierarchyKeys);
                if (info && !info.isAggregated[key]) {
                    values.add(String(info.hierarchy[key]));
                }
            });
            return [...values];
        },
        onSelectionChange: () => requestPlotUpdate(false),
        onVisibilityChange: () => requestPlotUpdate(true)
    });

    const widget = createHierarchyWidget({
        host: el,
        structure: x.hierarchy_structure,
        signal,
        chipTitle: "Drag to reorder hierarchy levels. Click to hide/show this level.",
        onSelectionChange: (_displayKeys, details) => {
            if (!details?.totalChanged) deselectedValues.clear();
            requestPlotUpdate(Boolean(details?.fitData));
        },
        onWidgetDragEnd: () => docking?.handleDragEnd(),
        valueControls
    });
    if (!widget) return;

    const { container, inner, allKeys, constraints } = widget;
    hierarchyKeys = allKeys;

    docking = createHierarchyWidgetDocking({
        host: el,
        container,
        signal,
        applySpace: (side, band, redraw = true) => {
            const chart = getHighchartsChart(el);
            if (!chart) return;
            const spacing = {};
            Object.keys(SPACING_DEFAULTS).forEach(s => {
                spacing[spacingKey(s)] = SPACING_DEFAULTS[s];
            });
            if (side) spacing[spacingKey(side)] = band;
            chart.update({ chart: spacing }, redraw);
        }
    });

    // Resizing a docked widget changes the chart spacing required by that edge.
    attachHierarchyWidgetResize({
        container,
        inner,
        host: el,
        signal,
        onResizeEnd: () => docking?.refresh()
    });

    function requestPlotUpdate(fitData = false) {
        const chart = getHighchartsChart(el);
        if (!chart) {
            setTimeout(() => requestPlotUpdate(fitData), 150);
            return;
        }
        installHierarchyHighchartsOptions(chart, widget.getActiveKeys, allKeys, x);
        chart.reflow();
        if (!initialDockApplied) {
            initialDockApplied = true;
            docking.applyInitial(false);
        }
        updateHighchartSeries(
            chart,
            widget.getDisplayKeys(),
            allKeys,
            constraints,
            widget.getTotalVisible(),
            fitData,
            valueInteraction
        );
    }

    setTimeout(requestPlotUpdate, 150);
};
