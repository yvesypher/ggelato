/* One hierarchy widget renderer used by all five public functions. */

import {
  TOTAL_KEY,
  createDepthColors,
  isValidHierarchyOrder,
  parseStructure
} from "./hierarchy-model.js";
import { pinHierarchyWidgetPosition } from "./floating-widget.js";
import { createValueMenu } from "./value-menu.js";

const DISABLED_DOT_COLOR = "#94a3b8";
const LINE_COLOR = "#a0aec0";
const LINE_COLOR_DISABLED = "#e2e8f0";
export const HIERARCHY_WIDGET_BUILD = "2026-07-28-menu-overlay-v3";

export function hierarchyConnectorPath(startX, endX, startY, endY) {
  const trackX = Math.max(2, Math.min(startX, endX) - 16);
  const direction = startY < endY ? 1 : -1;
  const radius = Math.min(
    6,
    Math.abs(endY - startY) / 2,
    Math.max(0, Math.min(startX, endX) - trackX)
  );
  return [
    `M ${startX} ${startY}`,
    `L ${trackX + radius} ${startY}`,
    `Q ${trackX} ${startY} ${trackX} ${startY + direction * radius}`,
    `L ${trackX} ${endY - direction * radius}`,
    `Q ${trackX} ${endY} ${trackX + radius} ${endY}`,
    `L ${endX} ${endY}`
  ].join(" ");
}

function listen(node, type, handler, signal) {
  node.addEventListener(type, handler, signal ? { signal } : undefined);
}

export function createHierarchyWidget({
  host,
  structure,
  signal,
  chipTitle,
  onSelectionChange,
  onWidgetDragEnd,
  valueControls,
  model,
  overlayParent = host,
  menuBoundary = null,
  protectedElement = null,
  classPrefix = "hierarchy"
}) {
  const parsed = parseStructure(structure);
  const initialKeys = model?.getActiveKeys?.() || parsed.activeKeys;
  if (!initialKeys.length) return null;

  const allKeys = [...(model?.getAllKeys?.() || initialKeys)];
  const constraints = [
    ...parsed.constraints,
    ...(model?.getConstraints?.() || [])
  ].filter((rule, index, rules) => rules.findIndex(candidate =>
    candidate.parent === rule.parent && candidate.child === rule.child
  ) === index);
  let activeKeys = [...initialKeys];
  let disabledKeys = new Set(model?.getDisabledKeys?.() || []);
  let totalVisible = model?.getTotalVisible?.() ?? true;

  if (getComputedStyle(host).position === "static") host.style.position = "relative";

  const cls = suffix => `${classPrefix}-${suffix}`;
  const createElement = (tag, className, parent) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    parent?.appendChild(node);
    return node;
  };

  const container = createElement("div", cls("addon-container"), host);
  container.dataset.hierarchyBuild = HIERARCHY_WIDGET_BUILD;
  const inner = createElement("div", cls("inner"), container);
  const tree = createElement("div", cls("tree"), inner);

  const displayedKeys = () => activeKeys.filter(key => !disabledKeys.has(key));
  const valuesForKey = key => {
    if (key === TOTAL_KEY) return ["Total"];
    const values = valueControls?.getValues?.(key) || [];
    return [...new Set(values.map(String))].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    );
  };
  const isValueHidden = (key, value) => {
    if (valueControls?.isHidden) return Boolean(valueControls.isHidden(key, value));
    return key === TOTAL_KEY ? !totalVisible : false;
  };
  const hiddenCountFor = key => valuesForKey(key)
    .reduce((count, value) => count + Number(isValueHidden(key, value)), 0);

  function updateModel(details = {}) {
    const snapshot = {
      activeKeys: [...activeKeys],
      disabledKeys: new Set(disabledKeys),
      totalVisible,
      ...details
    };
    model?.setHierarchyState?.(snapshot);
    onSelectionChange?.(displayedKeys(), snapshot);
  }

  function setValueHidden(key, value, hidden) {
    if (key === TOTAL_KEY) totalVisible = !hidden;
    valueControls?.setHidden?.(key, value, hidden);
    valueControls?.onVisibilityChange?.();
    if (!valueControls?.setHidden && key === TOTAL_KEY) {
      updateModel({ totalChanged: true, fitData: true });
    }
  }

  function showAllValues(key) {
    if (key === TOTAL_KEY) totalVisible = true;
    valueControls?.showAll?.(key);
    valueControls?.onVisibilityChange?.();
    if (!valueControls?.showAll && key === TOTAL_KEY) {
      updateModel({ totalChanged: true, fitData: true });
    }
  }

  const valueMenu = createValueMenu({
    host,
    parent: host,
    overlayParent,
    menuBoundary,
    protectedElement: protectedElement || container,
    signal,
    classPrefix,
    totalKey: TOTAL_KEY,
    getValues: valuesForKey,
    isValueHidden,
    hiddenCountFor,
    isLevelDisabled: key => key !== TOTAL_KEY && disabledKeys.has(key),
    getAccent: key => {
      const colors = createDepthColors(displayedKeys().length);
      if (key === TOTAL_KEY) return colors[0];
      const index = displayedKeys().indexOf(key);
      return index < 0 ? DISABLED_DOT_COLOR : colors[index + 1];
    },
    valueControls,
    setValueHidden,
    showAllValues,
    onHiddenStateChange: () => renderTree(true)
  });

  const clearDropStates = () => tree
    .querySelectorAll(`.${cls("chip")}`)
    .forEach(chip => chip.classList.remove("drag-over-top", "drag-over-bottom"));
  const dropsBelow = (event, chip) =>
    event.clientY - chip.getBoundingClientRect().top > chip.offsetHeight / 2;
  const shake = node => {
    if (!node) return;
    node.classList.add("error-shake");
    setTimeout(() => node.classList.remove("error-shake"), 400);
  };

  function drawLines() {
    tree.querySelector(`.${cls("svg-lines")}`)?.remove();
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", cls("svg-lines"));
    const chipByKey = new Map(
      [...tree.querySelectorAll(`.${cls("chip")}`)]
        .map(chip => [chip.dataset.key, chip])
    );

    constraints.forEach(({ parent, child }) => {
      const parentChip = chipByKey.get(parent);
      const childChip = chipByKey.get(child);
      if (!parentChip || !childChip) return;
      const y1 = parentChip.offsetTop + parentChip.offsetHeight / 2;
      const y2 = childChip.offsetTop + childChip.offsetHeight / 2;
      if (y1 === y2) return;
      const startX = parentChip.offsetLeft;
      const endX = childChip.offsetLeft;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", hierarchyConnectorPath(startX, endX, y1, y2));
      path.setAttribute("fill", "none");
      path.setAttribute("stroke-width", "2");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute(
        "stroke",
        disabledKeys.has(parent) || disabledKeys.has(child)
          ? LINE_COLOR_DISABLED
          : LINE_COLOR
      );
      svg.appendChild(path);
    });
    tree.prepend(svg);
  }

  function addHiddenBadge(chip, key) {
    const count = hiddenCountFor(key);
    if (!count) return;
    const badge = createElement("span", cls("hidden-badge"), chip);
    badge.title = `${count} hidden from plot`;
    badge.textContent = count;
  }

  function addChip(key, depthColors) {
    const isTotal = key === TOTAL_KEY;
    const chip = createElement(
      "div",
      `${cls("chip")}${isTotal ? ` ${cls("total-chip")}` : ""}`,
      tree
    );
    chip.dataset.key = key;
    chip.draggable = !isTotal;
    chip.classList.toggle("disabled", isTotal ? !totalVisible : disabledKeys.has(key));
    chip.title = isTotal
      ? "Total is fixed at the top."
      : chipTitle || "Drag to reorder hierarchy levels. Click to hide/show this level.";

    const colorDot = createElement("span", cls("chip-color"), chip);
    const displayIndex = displayedKeys().indexOf(key);
    colorDot.style.backgroundColor = isTotal
      ? (totalVisible ? depthColors[0] : DISABLED_DOT_COLOR)
      : (displayIndex < 0 ? DISABLED_DOT_COLOR : depthColors[displayIndex + 1]);
    const label = createElement("span", cls("chip-label"), chip);
    label.textContent = isTotal ? "Total" : key;
    addHiddenBadge(chip, key);

    listen(chip, "mouseenter", () => valueMenu.open(chip, key), signal);
    listen(chip, "mouseleave", valueMenu.closeSoon, signal);

    if (isTotal) {
      listen(chip, "click", () => {
        if (model?.onTotalClick) {
          model.onTotalClick();
          renderTree();
        } else {
          setValueHidden(TOTAL_KEY, "Total", totalVisible);
          renderTree();
        }
      }, signal);
      return;
    }

    let wasDragged = false;
    listen(chip, "dragstart", event => {
      valueMenu.close();
      event.dataTransfer.setData("text/plain", key);
      event.dataTransfer.effectAllowed = "move";
      chip.classList.add("dragging");
      wasDragged = true;
    }, signal);
    listen(chip, "dragend", () => {
      chip.classList.remove("dragging");
      clearDropStates();
      setTimeout(() => { wasDragged = false; }, 150);
    }, signal);
    listen(chip, "dragover", event => {
      event.preventDefault();
      clearDropStates();
      chip.classList.add(dropsBelow(event, chip)
        ? "drag-over-bottom"
        : "drag-over-top");
    }, signal);
    listen(chip, "dragleave", () => {
      chip.classList.remove("drag-over-top", "drag-over-bottom");
    }, signal);
    listen(chip, "drop", event => {
      event.preventDefault();
      clearDropStates();
      const draggedKey = event.dataTransfer.getData("text/plain");
      if (!draggedKey || draggedKey === key) return;
      const nextOrder = [...activeKeys];
      const draggedIndex = nextOrder.indexOf(draggedKey);
      if (draggedIndex < 0) return;
      nextOrder.splice(draggedIndex, 1);
      nextOrder.splice(nextOrder.indexOf(key) + Number(dropsBelow(event, chip)), 0, draggedKey);
      if (!isValidHierarchyOrder(nextOrder, constraints)) {
        shake(tree.querySelector(".dragging") || chip);
        return;
      }
      activeKeys = nextOrder;
      renderTree();
      updateModel({ structureChanged: true });
    }, signal);
    listen(chip, "click", () => {
      if (wasDragged) return;
      if (!disabledKeys.has(key) && displayedKeys().length <= 1) {
        shake(chip);
        return;
      }
      disabledKeys.has(key) ? disabledKeys.delete(key) : disabledKeys.add(key);
      renderTree();
      updateModel({ structureChanged: true });
    }, signal);
  }

  function renderTree(keepMenuOpen = false) {
    if (!keepMenuOpen) valueMenu.close();
    tree.replaceChildren();
    const depthColors = createDepthColors(displayedKeys().length);
    addChip(TOTAL_KEY, depthColors);
    activeKeys.forEach(key => addChip(key, depthColors));
    // Wait for both the chip layout and any surrounding htmlwidget layout to
    // settle before measuring the connector endpoints.
    requestAnimationFrame(() => requestAnimationFrame(drawLines));
  }

  const drag = { active: false, x: 0, y: 0, left: 0, top: 0 };
  listen(container, "mousedown", event => {
    if (event.button !== 0 || event.target.closest(
      `.${cls("chip")}, .${cls("value-dropdown")}, .${cls("resize-handle")}, input, button, label`
    )) return;
    const pinned = pinHierarchyWidgetPosition(container, host);
    Object.assign(drag, {
      active: true,
      x: event.clientX,
      y: event.clientY,
      left: pinned.left,
      top: pinned.top
    });
    container.classList.add("is-moving");
    event.preventDefault();
  }, signal);
  listen(document, "mousemove", event => {
    if (!drag.active) return;
    container.style.left = `${drag.left + event.clientX - drag.x}px`;
    container.style.top = `${drag.top + event.clientY - drag.y}px`;
    event.preventDefault();
  }, signal);
  listen(document, "mouseup", () => {
    if (!drag.active) return;
    drag.active = false;
    container.classList.remove("is-moving");
    onWidgetDragEnd?.();
  }, signal);

  function sync(next = {}) {
    activeKeys = [...(next.activeKeys || model?.getActiveKeys?.() || activeKeys)];
    disabledKeys = new Set(next.disabledKeys || model?.getDisabledKeys?.() || disabledKeys);
    totalVisible = next.totalVisible ?? model?.getTotalVisible?.() ?? totalVisible;
    renderTree();
  }

  renderTree();
  return {
    container,
    inner,
    allKeys,
    constraints,
    getActiveKeys: () => [...activeKeys],
    getDisplayKeys: displayedKeys,
    getDisabledKeys: () => new Set(disabledKeys),
    getTotalVisible: () => totalVisible,
    render: renderTree,
    sync
  };
}
