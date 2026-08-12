/*
 * add_hierarchy.js - plotly adapter
 * Shared panel/logic comes from hierarchy-core; this file owns everything
 * plotly-specific: splitting null-separated traces, reading aggregation
 * levels from hover text, styling via Plotly.restyle, and the panel's
 * resize handles + fit-to-container scaling.
 */

import {
    createHierarchyPanel,
    createPanelDocking,
    createDepthColors,
    requiredAncestors,
    pinPanelPosition
} from "../modules/hierarchy-core.js";

const CLASS_PREFIX = "hierarchy";
const AGGREGATED_PATTERN = /<aggregated>|&lt;aggregated&gt;|:na/g;
const RESIZE_DIRECTIONS = ["n", "s", "e", "w", "nw", "ne", "sw", "se"];
const FLOATING_RIGHT_MARGIN = 12;

const aggregationCache = new WeakMap();

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

export function getAggregationMap(trace, allKeys) {
    if (aggregationCache.has(trace)) return aggregationCache.get(trace);

    const values = Array.isArray(trace.text)
        ? trace.text
        : Array.isArray(trace.hovertext)
            ? trace.hovertext
            : [trace.text || trace.hovertext];

    let bestText = "";
    let fewestAggregates = Infinity;
    values.forEach(value => {
        if (typeof value !== "string" || value.length < 5) return;
        const count = (value.toLowerCase().replace(/\s+/g, "").match(AGGREGATED_PATTERN) || []).length;
        if (count < fewestAggregates) {
            bestText = value;
            fewestAggregates = count;
        }
    });

    let map = null;
    if (bestText) {
        const text = bestText.toLowerCase()
            .replace(/\s+/g, "")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">");
        map = Object.fromEntries(allKeys.map(key => {
            const prefix = `${key.toLowerCase()}:`;
            const aggregated = !text.includes(prefix)
                || text.includes(`${prefix}<aggregated>`)
                || text.includes(`${prefix}na`);
            return [key, aggregated];
        }));
    }
    aggregationCache.set(trace, map);
    return map;
}

export function computeTraceStyles(data, displayKeys, allKeys, constraints) {
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
        }

        const color = depthColors[depth];
        styles.visible.push(visible);
        styles.opacity.push(depth === displayKeys.length ? 0.6 : 1);
        styles["line.width"].push(depth === 0 ? 4 : depth === displayKeys.length ? 1 : 2.5);
        styles["line.color"].push(color);
        styles["marker.color"].push(color);
    });

    return { indices, styles };
}

/* ---------- panel resize handles (plotly-only feature) ---------- */

function attachResizeHandles(container, host, signal, onResizeEnd) {
    const state = {
        direction: null, x: 0, y: 0,
        left: 0, top: 0, width: 0, height: 0, aspect: 1
    };

    RESIZE_DIRECTIONS.forEach(direction => {
        const handle = document.createElement("div");
        handle.className = `${CLASS_PREFIX}-resize-handle ${direction}`;
        container.appendChild(handle);

        handle.addEventListener("mousedown", event => {
            event.preventDefault();
            event.stopPropagation(); // don't start the core panel drag
            const pinned = pinPanelPosition(container, host);
            Object.assign(state, {
                direction,
                x: event.clientX,
                y: event.clientY,
                left: pinned.left,
                top: pinned.top,
                width: container.offsetWidth,
                height: container.offsetHeight
            });
            state.aspect = state.width / state.height;
        }, { signal });
    });

    document.addEventListener("mousemove", event => {
        const { direction } = state;
        if (!direction) return;
        event.preventDefault();

        const dx = event.clientX - state.x;
        const dy = event.clientY - state.y;
        const minSize = 60;
        let width = state.width;
        let height = state.height;
        let left = state.left;
        let top = state.top;

        if (direction.includes("e")) width = Math.max(minSize, state.width + dx);
        if (direction.includes("w")) {
            width = Math.max(minSize, state.width - dx);
            left = state.left + state.width - width;
        }
        if (direction.length === 2) {
            height = width / state.aspect;
        } else if (direction === "s") {
            height = Math.max(minSize, state.height + dy);
        } else if (direction === "n") {
            height = Math.max(minSize, state.height - dy);
        }
        if (direction.includes("n")) top = state.top + state.height - height;

        Object.assign(container.style, {
            width: `${width}px`,
            height: `${height}px`,
            left: `${left}px`,
            top: `${top}px`
        });
    }, { signal });

    document.addEventListener("mouseup", () => {
        if (!state.direction) return;
        state.direction = null;
        onResizeEnd?.();
    }, { signal });
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

    const panel = createHierarchyPanel({
        host: el,
        structure,
        signal,
        onSelectionChange: () => updatePlotlyTraces(),
        onPanelDragEnd: () => docking?.handleDragEnd()
    });
    if (!panel) return;

    const { container, inner, allKeys, constraints } = panel;

    const getPlot = () => el.classList.contains("js-plotly-plot")
        ? el
        : el.querySelector(".js-plotly-plot");

    /* Edge docking via layout margins, with the original margin stored on the
       layout as a receipt. Plotly mutates layout objects in place, so each
       refresh first restores that recorded margin before calculating the new
       docked layout.

       The hierarchy panel replaces Plotly's right-hand legend. ggplotly can
       leave a wide right margin sized for that legend even after showlegend
       becomes false. Adding the panel band to that old margin creates the
       large white gap between the plotting area and the hierarchy panel.
       Therefore a right dock REPLACES the old right margin with the complete
       panel band. When the panel floats over the plot, the obsolete legend
       margin is reduced to a small edge margin so the plotting area expands
       fully to the right. Other edges still add the band so axis labels and
       titles retain their original space. */
    docking = createPanelDocking({
        host: el,
        container,
        signal,
        // ggplotly graph divs can be narrower than the widget container;
        // dock against the plot element so the panel hugs the plot.
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
                // The chip panel replaces the legend; a visible legend would
                // also push the margin further out via automargin.
                showlegend: false
            };
            sides.forEach(k => { update["margin." + k] = current[k]; });

            // Keep the plot full-width whenever the panel is floating or is
            // docked on an edge other than the right. The old right margin was
            // normally reserved for the legend that this panel replaces.
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

    // Resizing a docked panel changes how much space its edge needs.
    attachResizeHandles(container, el, signal, () => docking?.refresh());

    function updatePlotlyTraces() {
        const plot = getPlot();
        if (!plot?.data) {
            setTimeout(updatePlotlyTraces, 150);
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
                plot.data, panel.getDisplayKeys(), allKeys, constraints
            );
            if (indices.length) Plotly.restyle(plot, styles, indices);
            if (!initialDockApplied) {
                initialDockApplied = true;
                docking.applyInitial();
            }
        });
    }

    setTimeout(updatePlotlyTraces, 150);

    // Default 75% scale plus fit-to-container scaling while resizing.
    setTimeout(() => {
        const baseWidth = inner.offsetWidth;
        const baseHeight = inner.offsetHeight;
        const defaultScale = 0.75;
        container.style.width = `${baseWidth * defaultScale}px`;
        container.style.height = `${baseHeight * defaultScale}px`;

        const observer = new ResizeObserver(() => {
            const scale = Math.min(
                container.clientWidth / baseWidth,
                container.clientHeight / baseHeight
            );
            const offsetX = (container.clientWidth - baseWidth * scale) / 2;
            const offsetY = (container.clientHeight - baseHeight * scale) / 2;
            inner.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
        });
        observer.observe(container);
        signal.addEventListener("abort", () => observer.disconnect(), { once: true });
    }, 50);
};
