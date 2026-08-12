/*
 * add_hierarchy.js - plotly adapter
 * Shared widget/logic comes from hierarchy-core; this file owns everything
 * plotly-specific: splitting null-separated traces, reading aggregation
 * levels from hover text and styling via Plotly.restyle. Widget resizing is
 * shared by both adapters through hierarchy-core.
 */

import {
    createDepthColors,
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

const CLASS_PREFIX = "hierarchy";
const AGGREGATED_PATTERN = /<aggregated>|&lt;aggregated&gt;|:na/g;
const FLOATING_RIGHT_MARGIN = 12;
const MUTED_SERIES_COLOR = "#cbd5e1";

const aggregationCache = new WeakMap();
const hierarchyValueCache = new WeakMap();

/* ---------- trace handling (exported for tests) ---------- */

export function splitTrace(trace) {
    // Each segment MUST get its own line/marker objects: Plotly.restyle
    // mutates these nested objects in place, so shared references would make
    // every segment end up with the color of whichever trace is styled last.
    const ownStyle = source => ({
        ...source,
        line: { ...(source.line || {}) },
        marker: { ...(source.marker || {}) }
    });

    if (!trace.type?.includes("scatter") || !trace.x?.includes(null)) return [ownStyle(trace)];

    const traces = [];
    let start = 0;
    const addSegment = end => {
        if (end <= start) return;
        const segment = ownStyle(trace);
        ["x", "y", "text", "hovertext"].forEach(field => {
            if (Array.isArray(trace[field])) segment[field] = trace[field].slice(start, end);
        });
        delete segment.uid;
        traces.push(segment);
    };

    trace.x.forEach((value, index) => {
        if (value == null || trace.y[index] == null) {
            addSegment(index);
            start = index + 1;
        }
    });
    addSegment(trace.x.length);
    return traces;
}

function getBestHierarchyText(trace, allKeys) {
    const asArray = value => Array.isArray(value) ? value : [value];
    const values = [
        ...asArray(trace.text),
        ...asArray(trace.hovertext),
        trace.hovertemplate,
        trace.name
    ].filter(value => typeof value === "string");

    let bestText = "";
    let bestScore = -Infinity;
    values.forEach(value => {
        if (typeof value !== "string" || value.length < 5) return;
        const normalized = value.toLowerCase().replace(/<\/?(?:b|strong|span)[^>]*>/g, "");
        const keyCount = allKeys.reduce((count, key) =>
            count + Number(new RegExp(`${escapeRegExp(key)}\\s*[:=]`, "i").test(normalized)), 0
        );
        const aggregateCount = (normalized.replace(/\s+/g, "").match(AGGREGATED_PATTERN) || []).length;
        const score = keyCount * 100 - aggregateCount;
        if (score > bestScore) {
            bestText = value;
            bestScore = score;
        }
    });

    return bestText;
}

export function getHierarchyValueMap(trace, allKeys) {
    if (hierarchyValueCache.has(trace)) return hierarchyValueCache.get(trace);

    const bestText = getBestHierarchyText(trace, allKeys);
    const map = Object.fromEntries(allKeys.map(key => [key, null]));
    let found = false;

    // Prefer explicit hierarchy metadata when supplied by R or another caller.
    const directSources = [
        trace.custom?.hierarchy,
        trace.meta?.hierarchy,
        trace.custom,
        trace.meta
    ];
    directSources.forEach(source => {
        if (!source || typeof source !== "object" || Array.isArray(source)) return;
        allKeys.forEach(key => {
            if (map[key] != null) return;
            const matchingKey = Object.keys(source)
                .find(candidate => candidate.toLowerCase() === key.toLowerCase());
            if (matchingKey && source[matchingKey] != null) {
                map[key] = String(source[matchingKey]).trim();
                found = true;
            }
        });
    });

    if (bestText) {
        const text = bestText
            .replace(/<br\s*\/?>/gi, ";")
            .replace(/<\/?(?:b|strong|span)[^>]*>/gi, "")
            .replace(/&lt;/gi, "<")
            .replace(/&gt;/gi, ">")
            .replace(/&amp;/gi, "&")
            .replace(/\n/g, ";");
        allKeys.forEach(key => {
            if (map[key] != null) return;
            const pattern = new RegExp(
                `(?:^|[;|,])\\s*${escapeRegExp(key)}\\s*[:=]\\s*([^;|,]+)`,
                "i"
            );
            const match = text.match(pattern);
            if (match) {
                const raw = match[1].trim();
                map[key] = isAggregatedValue(raw)
                    ? "<aggregated>"
                    : raw.replace(/<[^>]+>/g, "").trim();
                found = true;
            }
        });
    }

    // ggplotly commonly stores interaction(State, Region, Purpose) only in
    // the trace name, separated by dots, while point hover text contains just
    // x and y. Recover the hierarchy from that interaction label.
    const nameParts = String(trace.name || "")
        .split(".")
        .map(value => value.trim());
    if (nameParts.length === allKeys.length) {
        allKeys.forEach((key, index) => {
            if (map[key] == null && nameParts[index] !== "") {
                map[key] = nameParts[index];
                found = true;
            }
        });
    }

    const result = found ? map : null;
    hierarchyValueCache.set(trace, result);
    return result;
}

export function getAggregationMap(trace, allKeys) {
    if (aggregationCache.has(trace)) return aggregationCache.get(trace);

    const hierarchy = getHierarchyValueMap(trace, allKeys);
    const map = hierarchy && Object.fromEntries(allKeys.map(key => {
        return [key, isAggregatedValue(hierarchy[key])];
    }));
    aggregationCache.set(trace, map);
    return map;
}

export function computeTraceStyles(
    data,
    displayKeys,
    allKeys,
    constraints,
    totalVisible = true,
    interaction = null
) {
    const depthColors = createDepthColors(displayKeys.length);
    const hiddenKeys = allKeys.filter(key => !displayKeys.includes(key));
    const ancestorsByDepth = new Map();
    const getAncestors = depth => {
        if (!ancestorsByDepth.has(depth)) {
            ancestorsByDepth.set(
                depth,
                requiredAncestors(displayKeys.slice(0, depth), constraints)
            );
        }
        return ancestorsByDepth.get(depth);
    };

    const indices = [];
    const styles = {
        visible: [],
        opacity: [],
        "line.width": [],
        "line.color": [],
        "marker.color": []
    };
    const hasSelection = Boolean(interaction?.hasSelection?.());

    data.forEach((trace, index) => {
        if (!trace.type?.includes("scatter")) return;
        indices.push(index);

        const isAggregated = getAggregationMap(trace, allKeys);
        let visible = false;
        let depth = 0;

        if (isAggregated) {
            displayKeys.forEach((key, i) => {
                if (!isAggregated[key]) depth = i + 1;
            });
            const ancestors = getAncestors(depth);
            visible = displayKeys.every((key, i) =>
                i < depth ? !isAggregated[key] : isAggregated[key]
            ) && hiddenKeys.every(key =>
                ancestors.has(key) ? !isAggregated[key] : isAggregated[key]
            );
            if (depth === 0 && !totalVisible) visible = false;
            if (visible && interaction?.isHidden?.(trace)) visible = false;
        }

        const selected = hasSelection && Boolean(
            interaction?.isSelected?.(trace, depth, displayKeys)
        );
        const color = hasSelection && !selected ? MUTED_SERIES_COLOR : depthColors[depth];
        styles.visible.push(visible);
        styles.opacity.push(hasSelection
            ? (selected ? 1 : 0.15)
            : (depth === displayKeys.length ? 0.6 : 1));
        styles["line.width"].push(hasSelection
            ? (selected ? 3 : 1)
            : (depth === 0 ? 4 : depth === displayKeys.length ? 1 : 2.5));
        styles["line.color"].push(color);
        styles["marker.color"].push(color);
    });

    return { indices, styles };
}

/* ---------- widget entry ---------- */

window.init_hierarchy = function initHierarchy(el, x) {
    el.querySelectorAll(".hierarchy-addon-container").forEach(node => node.remove());
    el._hierarchyAbortController?.abort();

    const structure = x.hierarchy_structure;
    if (!structure) return;

    const controller = new AbortController();
    const { signal } = controller;
    el._hierarchyAbortController = controller;

    let docking = null;
    let initialDockApplied = false;
    let hierarchyKeys = [];

    const getPlot = () => el.classList.contains("js-plotly-plot")
        ? el
        : el.querySelector(".js-plotly-plot");

    requestAnimationFrame(() => {
        const plot = getPlot();
        if (plot && window.Plotly?.Plots?.resize) Plotly.Plots.resize(plot);
    });

    // Everything is selected by default. Store only explicit deselections so
    // newly discovered values also begin selected without extra bookkeeping.
    const deselectedValues = new Map();
    const hiddenValues = new Map();
    const valueInteraction = {
        hasSelection: () => hasAnyValues(deselectedValues),
        isHidden: trace => {
            const hierarchy = getHierarchyValueMap(trace, hierarchyKeys);
            return Boolean(hierarchy && hierarchyKeys.some(key =>
                hiddenValues.get(key)?.has(String(hierarchy[key]))
            ));
        },
        isSelected: (trace, depth, displayKeys) => {
            if (depth === 0) {
                return !deselectedValues.get("__total__")?.has("Total");
            }
            const key = displayKeys[depth - 1];
            const hierarchy = getHierarchyValueMap(trace, hierarchyKeys);
            return Boolean(
                key && hierarchy &&
                !deselectedValues.get(key)?.has(String(hierarchy[key]))
            );
        }
    };

    const valueControls = createValueControls({
        deselectedValues,
        hiddenValues,
        getValues: key => {
            const plot = getPlot();
            const values = new Set();
            (plot?.data || []).forEach(trace => {
                const hierarchy = getHierarchyValueMap(trace, hierarchyKeys);
                const aggregated = getAggregationMap(trace, hierarchyKeys);
                if (hierarchy && aggregated && !aggregated[key] && hierarchy[key] != null) {
                    values.add(String(hierarchy[key]));
                }
            });
            return [...values];
        },
        onSelectionChange: () => updatePlotlyTraces(false),
        onVisibilityChange: () => updatePlotlyTraces(true)
    });

    const widget = createHierarchyWidget({
        host: el,
        structure,
        signal,
        onSelectionChange: (_displayKeys, details) => {
            if (!details?.totalChanged) deselectedValues.clear();
            updatePlotlyTraces(Boolean(details?.fitData));
        },
        onWidgetDragEnd: () => docking?.handleDragEnd(),
        valueControls
    });
    if (!widget) return;

    const { container, inner, allKeys, constraints } = widget;
    hierarchyKeys = allKeys;

    /* Edge docking via layout margins, with the original margin stored on the
       layout as a receipt. Plotly mutates layout objects in place, so each
       refresh first restores that recorded margin before calculating the new
       docked layout.

       The hierarchy widget replaces Plotly's right-hand legend. ggplotly can
       leave a wide right margin sized for that legend even after showlegend
       becomes false. Adding the widget band to that old margin creates the
       large white gap between the plotting area and the hierarchy widget.
       Therefore a right dock REPLACES the old right margin with the complete
       widget band. When the widget floats over the plot, the obsolete legend
       margin is reduced to a small edge margin so the plotting area expands
       fully to the right. Other edges still add the band so axis labels and
       titles retain their original space. */
    docking = createHierarchyWidgetDocking({
        host: el,
        container,
        signal,
        // ggplotly graph divs can be narrower than the widget container;
        // dock against the plot element so the widget hugs the plot.
        getBounds: () => (getPlot() || el).getBoundingClientRect(),
        applySpace: (side, band) => {
            const plot = getPlot();
            if (!plot?._fullLayout) return;

            const sides = ["l", "r", "t", "b"];
            const current = {};
            sides.forEach(k => {
                current[k] = plot.layout?.margin?.[k] ?? plot._fullLayout.margin[k];
            });

            // Restore the margin that existed before the previous dock. The
            // subtraction fallback supports layouts made by older versions.
            const previous = plot.layout?._hierarchyDock;
            if (previous?.side) {
                const k = previous.side[0];
                current[k] = Number.isFinite(previous.base)
                    ? previous.base
                    : Math.max(0, current[k] - previous.band);
            }

            const baseMargins = { ...current };

            const update = {
                // The chip widget replaces the legend; a visible legend would
                // also push the margin further out via automargin.
                showlegend: false
            };
            sides.forEach(k => { update["margin." + k] = current[k]; });

            // Keep the plot full-width whenever the widget is floating or is
            // docked on an edge other than the right. The old right margin was
            // normally reserved for the legend that this widget replaces.
            update["margin.r"] = Math.min(current.r, FLOATING_RIGHT_MARGIN);

            if (side) {
                const k = side[0];
                update["margin." + k] = side === "right"
                    ? band
                    : current[k] + band;
            }

            Plotly.relayout(plot, update);
            if (plot.layout) {
                plot.layout._hierarchyDock = side
                    ? { side, band, base: baseMargins[side[0]] }
                    : null;
            }
        }
    });

    // Resizing a docked widget changes how much space its edge needs.
    attachHierarchyWidgetResize({
        container,
        inner,
        host: el,
        signal,
        onResizeEnd: () => docking?.refresh(),
        classPrefix: CLASS_PREFIX
    });

    function fitPlotlyToVisibleData(plot) {
        const axisNames = new Set([
            ...Object.keys(plot.layout || {}),
            ...Object.keys(plot._fullLayout || {})
        ].filter(name => /^(xaxis|yaxis)\d*$/.test(name)));
        const update = {};
        axisNames.forEach(name => { update[`${name}.autorange`] = true; });
        return Object.keys(update).length
            ? Plotly.relayout(plot, update)
            : Promise.resolve();
    }

    function updatePlotlyTraces(fitData = false) {
        const plot = getPlot();
        if (!plot?.data) {
            setTimeout(() => updatePlotlyTraces(fitData), 150);
            return;
        }

        // One-time split of null-separated traces; Plotly.react is
        // asynchronous, so keep its promise and always restyle after it.
        if (!plot._hierarchyReady) {
            const splitData = plot.data.flatMap(splitTrace);
            plot._hierarchyReady = splitData.length !== plot.data.length
                ? Promise.resolve(Plotly.react(plot, splitData, plot.layout))
                : Promise.resolve();
        }
        plot._hierarchyReady.then(() => {
            const { indices, styles } = computeTraceStyles(
                plot.data,
                widget.getDisplayKeys(),
                allKeys,
                constraints,
                widget.getTotalVisible(),
                valueInteraction
            );
            const restyle = indices.length
                ? Plotly.restyle(plot, styles, indices)
                : Promise.resolve();
            Promise.resolve(restyle)
                .then(() => fitData ? fitPlotlyToVisibleData(plot) : null)
                .then(() => {
                    if (!initialDockApplied) {
                        initialDockApplied = true;
                        docking.applyInitial();
                    }
                });
        });
    }

    setTimeout(updatePlotlyTraces, 150);
};
