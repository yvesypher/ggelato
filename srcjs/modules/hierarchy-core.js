/*
 * hierarchy-core.js
 * Engine-agnostic logic shared by the plotly and highcharter addons:
 *   - structure parsing ("(State/Region)*Purpose") and ordering constraints
 *   - required-ancestor computation for hidden nested levels
 *   - depth color scale
 *   - the draggable, resizable chip panel (reorder, toggle, connector lines)
 *
 * Chart-specific behavior (trace/series styling and reserved plot space)
 * lives in the adapter entry files and is wired in through callbacks.
 */

const TOTAL_COLOR = "#e63946";
const LEVEL_COLOR_STOPS = ["#f4a261", "#e9c46a", "#2a9d8f"];
const DISABLED_DOT_COLOR = "#94a3b8";
const LINE_COLOR = "#a0aec0";
const LINE_COLOR_DISABLED = "#e2e8f0";
export const HIERARCHY_CORE_BUILD = "2026-07-19-total-simple-v3";
const EYE_ICON = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF_ICON = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

/* ---------- pure logic ---------- */

function interpolateRgb(startHex, endHex, amount) {
    const toRgb = hex => {
        const value = Number.parseInt(hex.slice(1), 16);
        return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
    };
    const start = toRgb(startHex);
    const end = toRgb(endHex);
    return `#${start
        .map((value, i) => Math.round(value + (end[i] - value) * amount)
            .toString(16)
            .padStart(2, "0"))
        .join("")}`;
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

/* Hidden keys that are ancestors (via "/" constraints) of the currently
   concrete displayed prefix must be CONCRETE, not aggregated; all other
   hidden keys must be aggregated. Adapters call this separately for each
   candidate series because its concrete prefix depends on its depth. */
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

/* ---------- DOM helpers ---------- */

export function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/* Convert a panel positioned via CSS right/transform into explicit
   left/top coordinates relative to its host, so drag/resize math can work
   with plain offsets. Used by the shared drag and resize controllers. */
export function pinPanelPosition(container, host) {
    const rect = container.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    const left = rect.left - hostRect.left;
    const top = rect.top - hostRect.top;
    Object.assign(container.style, {
        right: "auto",
        transform: "none",
        left: `${left}px`,
        top: `${top}px`
    });
    return { left, top };
}

/* Add eight resize handles to a hierarchy panel. Resizing itself is entirely
   engine-agnostic; adapters use onResizeEnd to refresh their chart-specific
   docking space (Plotly margins or Highcharts spacing). Corner handles retain
   the panel's aspect ratio, matching the original Plotly behavior. */
export function attachPanelResize({
    container,
    inner,
    host,
    signal,
    onResizeEnd,
    classPrefix = "hierarchy",
    minSize = 60,
    defaultScale = 0.75
}) {
    if (!container || !inner || !host) return;

    const directions = ["n", "s", "e", "w", "nw", "ne", "sw", "se"];
    const state = {
        direction: null,
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        aspect: 1
    };

    directions.forEach(direction => {
        const handle = document.createElement("div");
        handle.className = `${classPrefix}-resize-handle ${direction}`;
        container.appendChild(handle);

        handle.addEventListener("mousedown", event => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation(); // Do not start panel movement.

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
            state.aspect = state.width / Math.max(state.height, 1);
            container.classList.add("is-resizing");
        }, { signal });
    });

    document.addEventListener("mousemove", event => {
        const { direction } = state;
        if (!direction) return;
        event.preventDefault();

        const dx = event.clientX - state.x;
        const dy = event.clientY - state.y;
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
            height = Math.max(minSize, width / state.aspect);
            // When the minimum height is reached, keep the aspect ratio by
            // deriving width back from the clamped height.
            width = height * state.aspect;
            if (direction.includes("w")) {
                left = state.left + state.width - width;
            }
        } else if (direction === "s") {
            height = Math.max(minSize, state.height + dy);
        } else if (direction === "n") {
            height = Math.max(minSize, state.height - dy);
        }

        if (direction.includes("n")) {
            top = state.top + state.height - height;
        }

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
        container.classList.remove("is-resizing");
        onResizeEnd?.();
    }, { signal });

    // Capture the panel's natural size before scaling. Thereafter the inner
    // tree scales uniformly to fit any resized container and remains centred.
    const setupTimer = setTimeout(() => {
        const baseWidth = inner.offsetWidth;
        const baseHeight = inner.offsetHeight;
        if (!baseWidth || !baseHeight) return;

        container.style.width = `${baseWidth * defaultScale}px`;
        container.style.height = `${baseHeight * defaultScale}px`;

        const fitInnerToContainer = () => {
            const scale = Math.min(
                container.clientWidth / baseWidth,
                container.clientHeight / baseHeight
            );
            const offsetX = (container.clientWidth - baseWidth * scale) / 2;
            const offsetY = (container.clientHeight - baseHeight * scale) / 2;
            inner.style.transformOrigin = "top left";
            inner.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
        };

        const observer = new ResizeObserver(fitInnerToContainer);
        observer.observe(container);
        fitInnerToContainer();
        signal.addEventListener("abort", () => observer.disconnect(), { once: true });
    }, 50);

    signal.addEventListener("abort", () => clearTimeout(setupTimer), { once: true });
}

/* ---------- the chip panel ---------- */

export function createHierarchyPanel({
    host,
    structure,
    signal,
    chipTitle,
    onSelectionChange,
    onPanelDragEnd,
    valueControls,
    classPrefix = "hierarchy"
}) {
    const { activeKeys: parsedKeys, constraints } = parseStructure(structure);
    if (parsedKeys.length === 0) return null;

    const allKeys = [...parsedKeys];
    let activeKeys = [...parsedKeys];
    const disabledKeys = new Set();
    let totalVisible = true;

    if (getComputedStyle(host).position === "static") {
        host.style.position = "relative";
    }

    const cls = suffix => `${classPrefix}-${suffix}`;
    const createElement = (tag, className, parent) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (parent) parent.appendChild(node);
        return node;
    };

    const container = createElement("div", cls("addon-container"), host);
    container.dataset.hierarchyBuild = HIERARCHY_CORE_BUILD;
    const inner = createElement("div", cls("inner"), container);
    let valueDropdown = null;
    let dropdownHideTimer = null;

    const displayedKeys = () => activeKeys.filter(key => !disabledKeys.has(key));
    const dropsBelow = (event, chip) =>
        event.clientY - chip.getBoundingClientRect().top > chip.offsetHeight / 2;
    const clearDropStates = () => inner
        .querySelectorAll(`.${cls("chip")}`)
        .forEach(chip => chip.classList.remove("drag-over-top", "drag-over-bottom"));
    const shake = node => {
        if (!node) return;
        node.classList.add("error-shake");
        setTimeout(() => node.classList.remove("error-shake"), 400);
    };
    const notify = (details = {}) => onSelectionChange?.(displayedKeys(), {
        totalVisible,
        ...details
    });

    const valuesForKey = key => {
        if (key === "__total__") return ["Total"];
        const values = valueControls?.getValues?.(key) || [];
        return [...new Set(values.map(value => String(value)))].sort((a, b) =>
            a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
        );
    };
    const isValueHidden = (key, value) => key === "__total__"
        ? !totalVisible
        : Boolean(valueControls?.isHidden?.(key, value));
    const hiddenCountFor = key => valuesForKey(key)
        .reduce((count, value) => count + Number(isValueHidden(key, value)), 0);

    function setValueHidden(key, value, hidden) {
        if (key === "__total__") {
            totalVisible = !hidden;
            renderTree();
            notify({ totalChanged: true, fitData: true });
            return true;
        }
        valueControls?.setHidden?.(key, value, hidden);
        valueControls?.onVisibilityChange?.();
        return false;
    }

    function showAllValues(key) {
        if (key === "__total__") {
            totalVisible = true;
            renderTree();
            notify({ totalChanged: true, fitData: true });
            return true;
        }
        valueControls?.showAll?.(key);
        valueControls?.onVisibilityChange?.();
        return false;
    }

    function refreshHiddenBadges() {
        inner.querySelectorAll(`.${cls("chip")}[data-key]`).forEach(chip => {
            if (chip.dataset.key === "__total__") {
                chip.querySelector(`.${cls("hidden-badge")}`)?.remove();
                return;
            }
            const count = hiddenCountFor(chip.dataset.key);
            let badge = chip.querySelector(`.${cls("hidden-badge")}`);
            if (!count) {
                badge?.remove();
                return;
            }
            if (!badge) badge = createElement("span", cls("hidden-badge"), chip);
            badge.textContent = String(count);
            badge.title = `${count} hidden from plot`;
        });
    }

    function closeValueDropdownSoon() {
        clearTimeout(dropdownHideTimer);
        dropdownHideTimer = setTimeout(() => valueDropdown?.classList.remove("visible"), 250);
    }

    function populateValueDropdown(key) {
        if (!valueDropdown || !valueControls) return;
        const allValues = valuesForKey(key);
        const isTotal = key === "__total__";
        const levelDisabled = disabledKeys.has(key);
        const colors = createDepthColors(displayedKeys().length);
        const accent = key === "__total__"
            ? colors[0]
            : colors[Math.max(1, displayedKeys().indexOf(key) + 1)] || DISABLED_DOT_COLOR;
        let filter = "";
        valueDropdown.replaceChildren();

        const head = createElement("div", cls("value-head"), valueDropdown);
        const title = createElement("span", cls("value-title"), head);
        title.textContent = key === "__total__" ? "Total" : key;

        if (!isTotal && hiddenCountFor(key) > 0) {
            const showAll = createElement("button", `${cls("value-action")} ${cls("show-all")}`, head);
            showAll.type = "button";
            showAll.textContent = "Show all";
            showAll.title = key === "__total__"
                ? "Show Total in plot"
                : `Unhide all ${key} values`;
            showAll.addEventListener("click", () => {
                const rerendered = showAllValues(key);
                if (!rerendered) {
                    populateValueDropdown(key);
                    refreshHiddenBadges();
                }
            }, { signal });
        }

        const search = isTotal
            ? null
            : createElement("input", cls("value-search"), valueDropdown);
        if (search) {
            search.type = "search";
            search.placeholder = "Search";
        }

        if (levelDisabled) {
            const note = createElement("div", cls("value-note"), valueDropdown);
            note.textContent = "Level is hidden — click its chip to restore it.";
        }

        let selectAll = null;
        if (!isTotal && valueControls.isSelected && valueControls.setSelected && !levelDisabled) {
            const row = createElement("label", `${cls("value-row")} ${cls("select-all")}`, valueDropdown);
            selectAll = createElement("input", cls("value-check"), row);
            selectAll.type = "checkbox";
            selectAll.style.setProperty("--hierarchy-accent", accent);
            row.appendChild(document.createTextNode("Select all"));
        }

        const list = createElement("div", cls("value-list"), valueDropdown);
        const filteredValues = () => allValues.filter(value =>
            !filter || value.toLowerCase().includes(filter)
        );
        const checkableValues = () => filteredValues().filter(value =>
            !isValueHidden(key, value)
        );

        function syncSelectAll() {
            if (!selectAll) return;
            const values = checkableValues();
            const selectedCount = values.reduce((count, value) =>
                count + Number(Boolean(valueControls.isSelected(key, value))), 0
            );
            selectAll.checked = values.length > 0 && selectedCount === values.length;
            selectAll.indeterminate = selectedCount > 0 && selectedCount < values.length;
        }

        function renderValueRows() {
            list.replaceChildren();
            filteredValues().forEach(value => {
                const hidden = isValueHidden(key, value);
                const row = createElement("div", cls("value-row"), list);
                row.classList.toggle("is-hidden", hidden);

                const label = createElement("label", cls("value-label"), row);
                const checkbox = createElement("input", cls("value-check"), label);
                checkbox.type = "checkbox";
                checkbox.style.setProperty("--hierarchy-accent", accent);
                checkbox.checked = Boolean(valueControls.isSelected?.(key, value));
                checkbox.disabled = levelDisabled || hidden || !valueControls.setSelected;
                label.appendChild(document.createTextNode(value));
                checkbox.addEventListener("change", () => {
                    valueControls.setSelected?.(key, value, checkbox.checked);
                    valueControls.onSelectionChange?.();
                    syncSelectAll();
                }, { signal });

                const eye = createElement("button", cls("value-eye"), row);
                eye.type = "button";
                eye.title = hidden ? "Show in plot" : "Hide from plot";
                eye.innerHTML = hidden ? EYE_OFF_ICON : EYE_ICON;
                eye.addEventListener("click", () => {
                    const rerendered = setValueHidden(key, value, !hidden);
                    if (!rerendered) {
                        populateValueDropdown(key);
                        refreshHiddenBadges();
                    }
                }, { signal });
            });
            syncSelectAll();
        }

        selectAll?.addEventListener("change", () => {
            const values = checkableValues();
            if (valueControls.setSelectedMany) {
                valueControls.setSelectedMany(key, values, selectAll.checked);
            } else {
                values.forEach(value =>
                    valueControls.setSelected?.(key, value, selectAll.checked)
                );
            }
            valueControls.onSelectionChange?.();
            renderValueRows();
        }, { signal });

        search?.addEventListener("input", () => {
            filter = search.value.trim().toLowerCase();
            renderValueRows();
        }, { signal });

        if (!allValues.length) {
            const note = createElement("div", cls("value-note"), list);
            note.textContent = "No values available";
        } else {
            renderValueRows();
        }
    }

    function openValueDropdown(chip, key) {
        if (!valueControls) return;
        clearTimeout(dropdownHideTimer);
        populateValueDropdown(key);
        valueDropdown.style.top = `${chip.offsetTop}px`;
        valueDropdown.style.left = `${chip.offsetLeft + chip.offsetWidth + 10}px`;
        valueDropdown.style.visibility = "hidden";
        valueDropdown.classList.add("visible");

        // The panel normally starts docked on the right. Open the dropdown on
        // the left whenever the right-hand position would leave the widget or
        // viewport; otherwise the menu exists but appears to show nothing.
        const hostRect = host.getBoundingClientRect();
        const rightLimit = Math.min(hostRect.right, window.innerWidth);
        let dropdownRect = valueDropdown.getBoundingClientRect();
        if (dropdownRect.right > rightLimit - 4) {
            valueDropdown.style.left = `${chip.offsetLeft - valueDropdown.offsetWidth - 10}px`;
            dropdownRect = valueDropdown.getBoundingClientRect();
        }

        // Very narrow widgets may have room on neither side. In that case,
        // place the menu below the chip and keep it inside the panel's left edge.
        if (dropdownRect.left < Math.max(hostRect.left, 0) + 4) {
            valueDropdown.style.left = "0px";
            valueDropdown.style.top = `${chip.offsetTop + chip.offsetHeight + 6}px`;
        }
        valueDropdown.style.visibility = "visible";
    }

    /* panel move-dragging (adapters add docking/resizing on top) */
    const panelDrag = { active: false, x: 0, y: 0, left: 0, top: 0 };

    container.addEventListener("mousedown", event => {
        if (event.button !== 0 || event.target.closest(
            `.${cls("chip")}, .${cls("value-dropdown")}, input, button, label`
        )) return;
        const pinned = pinPanelPosition(container, host);
        Object.assign(panelDrag, {
            active: true,
            x: event.clientX,
            y: event.clientY,
            left: pinned.left,
            top: pinned.top
        });
        container.classList.add("is-moving");
        event.preventDefault();
    }, { signal });

    document.addEventListener("mousemove", event => {
        if (!panelDrag.active) return;
        container.style.left = `${panelDrag.left + event.clientX - panelDrag.x}px`;
        container.style.top = `${panelDrag.top + event.clientY - panelDrag.y}px`;
        event.preventDefault();
    }, { signal });

    document.addEventListener("mouseup", () => {
        if (!panelDrag.active) return;
        panelDrag.active = false;
        container.classList.remove("is-moving");
        onPanelDragEnd?.();
    }, { signal });

    /* connector lines between parent/child chips */
    function drawLines() {
        inner.querySelectorAll(`.${cls("svg-lines")}`).forEach(svg => svg.remove());
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("class", cls("svg-lines"));

        const chipByKey = new Map(
            [...inner.querySelectorAll(`.${cls("chip")}`)].map(chip => [chip.dataset.key, chip])
        );

        const addConnector = (parentKey, childKey, disabled = false) => {
            const parent = chipByKey.get(parentKey);
            const child = chipByKey.get(childKey);
            if (!parent || !child) return;

            const y1 = parent.offsetTop + parent.offsetHeight / 2;
            const y2 = child.offsetTop + child.offsetHeight / 2;
            if (y1 === y2) return;

            const startX = parent.offsetLeft;
            const endX = child.offsetLeft;
            const trackX = Math.min(startX, endX) - 16;
            const radius = 6;
            const direction = y1 < y2 ? 1 : -1;

            const path = document.createElementNS(svgNS, "path");
            path.setAttribute("d", [
                `M ${startX} ${y1}`,
                `L ${trackX + radius} ${y1}`,
                `Q ${trackX} ${y1} ${trackX} ${y1 + direction * radius}`,
                `L ${trackX} ${y2 - direction * radius}`,
                `Q ${trackX} ${y2} ${trackX + radius} ${y2}`,
                `L ${endX} ${y2}`
            ].join(" "));
            path.setAttribute("fill", "none");
            path.setAttribute("stroke-width", "2");
            path.setAttribute("stroke-linecap", "round");
            path.setAttribute(
                "stroke",
                disabled ? LINE_COLOR_DISABLED : LINE_COLOR
            );
            svg.appendChild(path);
        };

        constraints.forEach(rule => {
            addConnector(
                rule.parent,
                rule.child,
                disabledKeys.has(rule.parent) || disabledKeys.has(rule.child)
            );
        });

        inner.prepend(svg);
    }

    function applyOrder(nextOrder, chipToShake) {
        if (!isValidHierarchyOrder(nextOrder, constraints)) {
            shake(chipToShake);
            return;
        }
        activeKeys = nextOrder;
        renderTree();
        notify();
    }

    function renderTree() {
        inner.replaceChildren();
        const displayKeys = displayedKeys();
        const depthColors = createDepthColors(displayKeys.length);

        valueDropdown = createElement("div", cls("value-dropdown"), inner);
        valueDropdown.addEventListener("mouseenter", () => clearTimeout(dropdownHideTimer), { signal });
        valueDropdown.addEventListener("mouseleave", closeValueDropdownSoon, { signal });
        valueDropdown.addEventListener("mousedown", event => event.stopPropagation(), { signal });
        valueDropdown.addEventListener("click", event => event.stopPropagation(), { signal });

        const totalChip = createElement(
            "div",
            `${cls("chip")} ${cls("total-chip")}`,
            inner
        );
        totalChip.draggable = false;
        totalChip.dataset.key = "__total__";
        totalChip.classList.toggle("disabled", !totalVisible);
        totalChip.title = "Click to hide/show the total series. Total is fixed at the top.";

        const totalColorDot = createElement("span", cls("chip-color"), totalChip);
        totalColorDot.style.backgroundColor = totalVisible
            ? depthColors[0]
            : DISABLED_DOT_COLOR;

        const totalLabel = createElement("span", cls("chip-label"), totalChip);
        totalLabel.textContent = "Total";

        totalChip.addEventListener(
            "mouseenter",
            () => openValueDropdown(totalChip, "__total__"),
            { signal }
        );
        totalChip.addEventListener("mouseleave", closeValueDropdownSoon, { signal });

        totalChip.addEventListener("click", () => {
            totalVisible = !totalVisible;
            renderTree();
            notify({ totalChanged: true, fitData: true });
        }, { signal });

        activeKeys.forEach(key => {
            const chip = createElement("div", cls("chip"), inner);
            chip.draggable = true;
            chip.dataset.key = key;
            chip.classList.toggle("disabled", disabledKeys.has(key));
            if (chipTitle) chip.title = chipTitle;

            const colorDot = createElement("span", cls("chip-color"), chip);
            const displayIndex = displayKeys.indexOf(key);
            colorDot.style.backgroundColor = displayIndex < 0
                ? DISABLED_DOT_COLOR
                : depthColors[displayIndex + 1];

            const label = createElement("span", cls("chip-label"), chip);
            label.textContent = key;

            let wasDragged = false;

            chip.addEventListener("mouseenter", () => openValueDropdown(chip, key), { signal });
            chip.addEventListener("mouseleave", closeValueDropdownSoon, { signal });

            chip.addEventListener("dragstart", event => {
                valueDropdown.classList.remove("visible");
                event.dataTransfer.setData("text/plain", key);
                event.dataTransfer.effectAllowed = "move";
                chip.classList.add("dragging");
                wasDragged = true;
            }, { signal });

            chip.addEventListener("dragend", () => {
                chip.classList.remove("dragging");
                clearDropStates();
                setTimeout(() => { wasDragged = false; }, 150);
            }, { signal });

            chip.addEventListener("dragover", event => {
                event.preventDefault();
                clearDropStates();
                chip.classList.add(dropsBelow(event, chip) ? "drag-over-bottom" : "drag-over-top");
            }, { signal });

            chip.addEventListener("dragleave", () => {
                chip.classList.remove("drag-over-top", "drag-over-bottom");
            }, { signal });

            chip.addEventListener("drop", event => {
                event.preventDefault();
                clearDropStates();
                const draggedKey = event.dataTransfer.getData("text/plain");
                if (!draggedKey || draggedKey === key) return;

                const nextOrder = [...activeKeys];
                const draggedIndex = nextOrder.indexOf(draggedKey);
                if (draggedIndex === -1) return;
                nextOrder.splice(draggedIndex, 1);
                nextOrder.splice(
                    nextOrder.indexOf(key) + Number(dropsBelow(event, chip)),
                    0,
                    draggedKey
                );

                applyOrder(
                    nextOrder,
                    inner.querySelector(".dragging") || chip
                );
            }, { signal });

            chip.addEventListener("click", () => {
                if (wasDragged) return;
                if (!disabledKeys.has(key) && displayKeys.length <= 1) {
                    shake(chip);
                    return;
                }
                disabledKeys.has(key) ? disabledKeys.delete(key) : disabledKeys.add(key);
                renderTree();
                notify();
            }, { signal });
        });

        refreshHiddenBadges();

        requestAnimationFrame(drawLines);
    }

    renderTree();

    return {
        container,
        inner,
        allKeys,
        constraints,
        getActiveKeys: () => [...activeKeys],
        getDisplayKeys: displayedKeys,
        getTotalVisible: () => totalVisible
    };
}

/* ---------- edge docking ---------- */

/* Engine-agnostic docking: the panel starts docked on one edge with blank
   space reserved there; dropped over the plot it floats and the space is
   released; dropped near any edge it docks there. The engine-specific
   "reserve blank space" primitive is injected via applySpace(side, band,
   ...extra) - Highcharts uses chart spacing, plotly uses layout margins. */
export function createPanelDocking({
    host,
    container,
    signal,
    applySpace,
    // The box the panel docks against, in viewport coordinates. Defaults to
    // the host, but engines whose plot element is smaller than the widget
    // container (e.g. fixed-width ggplotly inside a full-width htmlwidget)
    // should return the plot element's rect so the panel hugs the PLOT.
    getBounds = () => host.getBoundingClientRect(),
    gap = 20,        // panel to plot edge
    innerGap = 12,   // panel to plot area
    threshold = 30,
    initialSide = "right"
}) {
    let dockedSide = initialSide;

    const band = () => ((dockedSide === "left" || dockedSide === "right")
        ? container.offsetWidth
        : container.offsetHeight) + gap + innerGap;

    function snapPanel() {
        const hostRect = host.getBoundingClientRect();
        const bounds = getBounds();
        const minLeft = bounds.left - hostRect.left + gap;
        const maxLeft = bounds.right - hostRect.left - container.offsetWidth - gap;
        const minTop = bounds.top - hostRect.top + gap;
        const maxTop = bounds.bottom - hostRect.top - container.offsetHeight - gap;

        const rect = container.getBoundingClientRect();
        let left = rect.left - hostRect.left;
        let top = rect.top - hostRect.top;

        if (dockedSide === "right") left = maxLeft;
        else if (dockedSide === "left") left = minLeft;
        else if (dockedSide === "top") top = minTop;
        else if (dockedSide === "bottom") top = maxTop;

        left = Math.min(Math.max(left, minLeft), Math.max(minLeft, maxLeft));
        top = Math.min(Math.max(top, minTop), Math.max(minTop, maxTop));

        Object.assign(container.style, {
            right: "auto",
            transform: "none",
            left: `${left}px`,
            top: `${top}px`
        });
    }

    const apply = (...extra) =>
        applySpace(dockedSide, dockedSide ? band() : 0, ...extra);

    function handleDragEnd() {
        const bounds = getBounds();
        const rect = container.getBoundingClientRect();
        const distances = {
            left: rect.left - bounds.left,
            right: bounds.right - rect.right,
            top: rect.top - bounds.top,
            bottom: bounds.bottom - rect.bottom
        };
        const nearest = Object.keys(distances)
            .reduce((a, b) => (distances[a] <= distances[b] ? a : b));
        const newSide = distances[nearest] < threshold ? nearest : null;

        const changed = newSide !== dockedSide;
        dockedSide = newSide;
        if (dockedSide) snapPanel();
        if (changed) apply();
    }

    const observer = new ResizeObserver(() => {
        if (dockedSide) snapPanel();
    });
    observer.observe(host);
    signal.addEventListener("abort", () => observer.disconnect(), { once: true });

    return {
        handleDragEnd,
        applyInitial(...extra) {
            if (dockedSide) snapPanel();
            apply(...extra);
        },
        // Re-snap and re-reserve space, e.g. after the panel itself resizes.
        refresh() {
            if (!dockedSide) return;
            snapPanel();
            apply();
        },
        getSide: () => dockedSide
    };
}
