(() => {
  // fixed/ggelato/srcjs/modules/core/hierarchy-model.js
  var TOTAL_KEY = "__total__";
  var TOTAL_COLOR = "#e63946";
  var LEVEL_COLOR_STOPS = ["#f4a261", "#e9c46a", "#5495CFFF"];
  var AGGREGATED_VALUES = /* @__PURE__ */ new Set([
    "",
    "na",
    "nan",
    "n/a",
    "null",
    "undefined",
    "all",
    "total",
    "aggregate",
    "aggregated",
    "<aggregated>"
  ]);
  function dataFrameToRows(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (typeof data !== "object") return [];
    const keys = Object.keys(data);
    if (!keys.length) return [];
    const length = Array.isArray(data[keys[0]]) ? data[keys[0]].length : 0;
    return Array.from({ length }, (_, index) => Object.fromEntries(
      keys.map((key) => [key, Array.isArray(data[key]) ? data[key][index] : null])
    ));
  }
  function isAggregatedValue(value) {
    if (value == null) return true;
    const text = String(value).replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&amp;/gi, "&").trim().toLowerCase();
    return AGGREGATED_VALUES.has(text) || text.includes("aggregated");
  }
  function interpolateRgb(startHex, endHex, amount) {
    const toRgb = (hex) => {
      const value = Number.parseInt(hex.slice(1), 16);
      return [value >> 16 & 255, value >> 8 & 255, value & 255];
    };
    const start = toRgb(startHex);
    const end = toRgb(endHex);
    return `#${start.map(
      (value, index) => Math.round(value + (end[index] - value) * amount).toString(16).padStart(2, "0")
    ).join("")}`;
  }
  function createDepthColors(levelCount) {
    if (levelCount <= LEVEL_COLOR_STOPS.length) {
      return [TOTAL_COLOR, ...LEVEL_COLOR_STOPS.slice(0, levelCount)];
    }
    const lastStop = LEVEL_COLOR_STOPS.length - 1;
    const levelColors = Array.from({ length: levelCount }, (_, index) => {
      const position = index / (levelCount - 1) * lastStop;
      const leftStop = Math.min(Math.floor(position), lastStop - 1);
      return interpolateRgb(
        LEVEL_COLOR_STOPS[leftStop],
        LEVEL_COLOR_STOPS[leftStop + 1],
        position - leftStop
      );
    });
    return [TOTAL_COLOR, ...levelColors];
  }
  function parseStructure(structure) {
    const activeKeys = [];
    const constraints = [];
    const tokens = typeof structure === "string" ? structure.replace(/\s+/g, "").match(/[^/*()]+|[/*()]/g) : null;
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
        left.leaves.forEach((parent) => right.roots.forEach((child) => {
          if (!constraints.some((rule) => rule.parent === parent && rule.child === child)) {
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
  function isValidHierarchyOrder(keys, constraints) {
    return constraints.every(({ parent, child }) => {
      const parentIndex = keys.indexOf(parent);
      const childIndex = keys.indexOf(child);
      return parentIndex < 0 || childIndex < 0 || parentIndex < childIndex;
    });
  }

  // fixed/ggelato/srcjs/modules/core/floating-widget.js
  function pinHierarchyWidgetPosition(container, host) {
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

  // fixed/ggelato/srcjs/modules/core/value-menu.js
  var EYE_ICON = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF_ICON = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  function listen(node, type, handler, signal) {
    node.addEventListener(type, handler, signal ? { signal } : void 0);
  }
  function createValueMenu({
    host,
    parent,
    overlayParent = parent,
    menuBoundary = null,
    protectedElement = host,
    signal,
    classPrefix,
    totalKey,
    getValues,
    isValueHidden,
    hiddenCountFor,
    isLevelDisabled,
    getAccent,
    valueControls,
    setValueHidden,
    showAllValues,
    onHiddenStateChange = () => {
    }
  }) {
    const cls = (suffix) => `${classPrefix}-${suffix}`;
    const createElement = (tag, className, target = parent) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      target?.appendChild(node);
      return node;
    };
    const menu = createElement("div", cls("value-dropdown"));
    let hideTimer = null;
    let anchorChip = null;
    const resolveNode = (value) => typeof value === "function" ? value() : value;
    function currentOverlayParent() {
      const resolved = resolveNode(overlayParent);
      return resolved?.isConnected ? resolved : parent;
    }
    const close = () => {
      menu.classList.remove("visible");
      anchorChip = null;
    };
    const closeSoon = () => {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(close, 250);
    };
    listen(menu, "mouseenter", () => clearTimeout(hideTimer), signal);
    listen(menu, "mouseleave", closeSoon, signal);
    listen(menu, "mousedown", (event) => event.stopPropagation(), signal);
    listen(menu, "click", (event) => event.stopPropagation(), signal);
    function positionMenu(chip) {
      if (!chip?.isConnected || !menu.classList.contains("visible")) return;
      const gap = 16;
      const edgeGap = 6;
      const overlay = currentOverlayParent();
      if (overlay && menu.parentElement !== overlay) overlay.appendChild(menu);
      const protectedNode = resolveNode(protectedElement) || host;
      const protectedRect = protectedNode.getBoundingClientRect();
      const positioningParent = menu.offsetParent || overlay || parent;
      const parentRect = positioningParent.getBoundingClientRect();
      const chipRect = chip.getBoundingClientRect();
      menu.style.width = "";
      menu.style.minWidth = "";
      menu.style.maxHeight = "";
      menu.style.overflowY = "";
      const menuRect = menu.getBoundingClientRect();
      const menuWidth = menuRect.width || menu.offsetWidth;
      const menuHeight = menuRect.height || menu.offsetHeight;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || protectedRect.right;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || protectedRect.bottom;
      const boundaryNode = resolveNode(menuBoundary) || overlay;
      const boundaryRect = boundaryNode?.getBoundingClientRect?.() || {
        left: 0,
        right: viewportWidth,
        top: 0,
        bottom: viewportHeight
      };
      const bounds = {
        left: Math.max(boundaryRect.left + edgeGap, edgeGap),
        right: Math.min(boundaryRect.right - edgeGap, viewportWidth - edgeGap),
        top: Math.max(boundaryRect.top + edgeGap, edgeGap),
        bottom: Math.min(boundaryRect.bottom - edgeGap, viewportHeight - edgeGap)
      };
      const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
      const maxLeft = bounds.right - menuWidth;
      const maxTop = bounds.bottom - menuHeight;
      const verticalTop = clamp(chipRect.top, bounds.top, maxTop);
      const horizontalLeft = clamp(chipRect.left, bounds.left, maxLeft);
      const spaces = {
        right: bounds.right - protectedRect.right - gap,
        left: protectedRect.left - bounds.left - gap,
        below: bounds.bottom - protectedRect.bottom - gap,
        above: protectedRect.top - bounds.top - gap
      };
      const candidates = [
        {
          side: "right",
          fits: spaces.right >= menuWidth,
          left: protectedRect.right + gap,
          top: verticalTop
        },
        {
          side: "left",
          fits: spaces.left >= menuWidth,
          left: protectedRect.left - menuWidth - gap,
          top: verticalTop
        },
        {
          side: "below",
          fits: spaces.below >= menuHeight,
          left: horizontalLeft,
          top: protectedRect.bottom + gap
        },
        {
          side: "above",
          fits: spaces.above >= menuHeight,
          left: horizontalLeft,
          top: protectedRect.top - menuHeight - gap
        }
      ];
      let placement = candidates.find((candidate) => candidate.fits);
      let viewportLeft;
      let viewportTop;
      if (placement) {
        viewportLeft = clamp(placement.left, bounds.left, maxLeft);
        viewportTop = clamp(placement.top, bounds.top, maxTop);
      } else {
        const regions = [
          {
            side: "right",
            left: protectedRect.right + gap,
            right: bounds.right,
            top: bounds.top,
            bottom: bounds.bottom
          },
          {
            side: "left",
            left: bounds.left,
            right: protectedRect.left - gap,
            top: bounds.top,
            bottom: bounds.bottom
          },
          {
            side: "below",
            left: bounds.left,
            right: bounds.right,
            top: protectedRect.bottom + gap,
            bottom: bounds.bottom
          },
          {
            side: "above",
            left: bounds.left,
            right: bounds.right,
            top: bounds.top,
            bottom: protectedRect.top - gap
          }
        ].map((region2) => ({
          ...region2,
          width: Math.max(0, region2.right - region2.left),
          height: Math.max(0, region2.bottom - region2.top)
        }));
        const region = regions.filter((candidate) => candidate.width >= 96 && candidate.height >= 96).sort((a, b) => b.width * b.height - a.width * a.height)[0];
        if (!region) {
          close();
          return;
        }
        const fittedWidth = Math.min(menuWidth, region.width);
        const fittedHeight = Math.min(menuHeight, region.height);
        menu.style.width = `${fittedWidth}px`;
        menu.style.minWidth = "0";
        menu.style.maxHeight = `${fittedHeight}px`;
        menu.style.overflowY = "auto";
        placement = region;
        viewportLeft = clamp(chipRect.left, region.left, region.right - fittedWidth);
        viewportTop = clamp(chipRect.top, region.top, region.bottom - fittedHeight);
      }
      menu.dataset.side = placement.side;
      menu.dataset.protectedElement = protectedNode.classList?.contains("fridge-hierarchy-panel") ? "fridge-hierarchy-panel" : protectedNode.className || protectedNode.tagName;
      menu.style.left = `${viewportLeft - parentRect.left + (positioningParent.scrollLeft || 0)}px`;
      menu.style.top = `${viewportTop - parentRect.top + (positioningParent.scrollTop || 0)}px`;
    }
    function populate(key) {
      const allValues = getValues(key);
      const isTotal = key === totalKey;
      const levelDisabled = isLevelDisabled(key);
      const accent = getAccent(key);
      let filter = "";
      menu.replaceChildren();
      const head = createElement("div", cls("value-head"), menu);
      const title = createElement("span", cls("value-title"), head);
      title.textContent = isTotal ? "Total" : key;
      if (hiddenCountFor(key) > 0) {
        const showAll = createElement(
          "button",
          `${cls("value-action")} ${cls("show-all")}`,
          head
        );
        showAll.type = "button";
        showAll.textContent = "Show all";
        showAll.title = isTotal ? "Show Total in plot" : `Unhide all ${key} values`;
        listen(showAll, "click", () => {
          showAllValues(key);
          onHiddenStateChange();
          populate(key);
          positionMenu(anchorChip);
        }, signal);
      }
      const search = isTotal ? null : createElement("input", cls("value-search"), menu);
      if (search) {
        search.type = "search";
        search.placeholder = "Search";
      }
      if (levelDisabled) {
        const note = createElement("div", cls("value-note"), menu);
        note.textContent = "Level is hidden \u2014 click its chip to restore it.";
      }
      let selectAll = null;
      if (!isTotal && valueControls?.isSelected && valueControls?.setSelected && !levelDisabled) {
        const row = createElement(
          "label",
          `${cls("value-row")} ${cls("select-all")}`,
          menu
        );
        selectAll = createElement("input", cls("value-check"), row);
        selectAll.type = "checkbox";
        selectAll.style.setProperty("--hierarchy-accent", accent);
        row.appendChild(document.createTextNode("Select all"));
      }
      const list = createElement("div", cls("value-list"), menu);
      const filteredValues = () => allValues.filter(
        (value) => !filter || value.toLowerCase().includes(filter)
      );
      const checkableValues = () => filteredValues().filter(
        (value) => !isValueHidden(key, value)
      );
      function syncSelectAll() {
        if (!selectAll) return;
        const values = checkableValues();
        const selectedCount = values.reduce(
          (count, value) => count + Number(Boolean(valueControls.isSelected(key, value))),
          0
        );
        selectAll.checked = values.length > 0 && selectedCount === values.length;
        selectAll.indeterminate = selectedCount > 0 && selectedCount < values.length;
      }
      function renderRows() {
        list.replaceChildren();
        filteredValues().forEach((value) => {
          const hidden = isValueHidden(key, value);
          const row = createElement("div", cls("value-row"), list);
          row.classList.toggle("is-hidden", hidden);
          const label = createElement("label", cls("value-label"), row);
          const checkbox = createElement("input", cls("value-check"), label);
          checkbox.type = "checkbox";
          checkbox.style.setProperty("--hierarchy-accent", accent);
          checkbox.checked = Boolean(valueControls?.isSelected?.(key, value));
          checkbox.disabled = levelDisabled || hidden || !valueControls?.setSelected;
          label.appendChild(document.createTextNode(value));
          listen(checkbox, "change", () => {
            valueControls?.setSelected?.(key, value, checkbox.checked);
            valueControls?.onSelectionChange?.();
            syncSelectAll();
          }, signal);
          const eye = createElement("button", cls("value-eye"), row);
          eye.type = "button";
          eye.title = hidden ? "Show in plot" : "Hide from plot";
          eye.innerHTML = hidden ? EYE_OFF_ICON : EYE_ICON;
          listen(eye, "click", () => {
            setValueHidden(key, value, !hidden);
            onHiddenStateChange();
            populate(key);
            positionMenu(anchorChip);
          }, signal);
        });
        syncSelectAll();
      }
      if (selectAll) {
        listen(selectAll, "change", () => {
          const values = checkableValues();
          if (valueControls.setSelectedMany) {
            valueControls.setSelectedMany(key, values, selectAll.checked);
          } else {
            values.forEach(
              (value) => valueControls.setSelected?.(key, value, selectAll.checked)
            );
          }
          valueControls.onSelectionChange?.();
          renderRows();
        }, signal);
      }
      if (search) {
        listen(search, "input", () => {
          filter = search.value.trim().toLowerCase();
          renderRows();
          positionMenu(anchorChip);
        }, signal);
      }
      if (!allValues.length) {
        const note = createElement("div", cls("value-note"), list);
        note.textContent = "No values available";
      } else {
        renderRows();
      }
    }
    function open(chip, key) {
      clearTimeout(hideTimer);
      anchorChip = chip;
      const overlay = currentOverlayParent();
      if (overlay && menu.parentElement !== overlay) overlay.appendChild(menu);
      populate(key);
      menu.style.top = "0px";
      menu.style.left = "0px";
      menu.style.visibility = "hidden";
      menu.classList.add("visible");
      positionMenu(chip);
      menu.style.visibility = "visible";
    }
    listen(window, "resize", () => positionMenu(anchorChip), signal);
    listen(window, "scroll", () => positionMenu(anchorChip), signal);
    signal?.addEventListener("abort", () => {
      clearTimeout(hideTimer);
      menu.remove();
    }, { once: true });
    return { menu, open, close, closeSoon };
  }

  // fixed/ggelato/srcjs/modules/core/hierarchy-widget.js
  var DISABLED_DOT_COLOR = "#94a3b8";
  var LINE_COLOR = "#a0aec0";
  var LINE_COLOR_DISABLED = "#e2e8f0";
  var HIERARCHY_WIDGET_BUILD = "2026-07-28-menu-overlay-v3";
  function hierarchyConnectorPath(startX, endX, startY, endY) {
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
  function listen2(node, type, handler, signal) {
    node.addEventListener(type, handler, signal ? { signal } : void 0);
  }
  function createHierarchyWidget({
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
    const allKeys = [...model?.getAllKeys?.() || initialKeys];
    const constraints = [
      ...parsed.constraints,
      ...model?.getConstraints?.() || []
    ].filter((rule, index, rules) => rules.findIndex(
      (candidate) => candidate.parent === rule.parent && candidate.child === rule.child
    ) === index);
    let activeKeys = [...initialKeys];
    let disabledKeys = new Set(model?.getDisabledKeys?.() || []);
    let totalVisible = model?.getTotalVisible?.() ?? true;
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    const cls = (suffix) => `${classPrefix}-${suffix}`;
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
    const displayedKeys = () => activeKeys.filter((key) => !disabledKeys.has(key));
    const valuesForKey = (key) => {
      if (key === TOTAL_KEY) return ["Total"];
      const values = valueControls?.getValues?.(key) || [];
      return [...new Set(values.map(String))].sort(
        (a, b) => a.localeCompare(b, void 0, { numeric: true, sensitivity: "base" })
      );
    };
    const isValueHidden = (key, value) => {
      if (valueControls?.isHidden) return Boolean(valueControls.isHidden(key, value));
      return key === TOTAL_KEY ? !totalVisible : false;
    };
    const hiddenCountFor = (key) => valuesForKey(key).reduce((count, value) => count + Number(isValueHidden(key, value)), 0);
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
      isLevelDisabled: (key) => key !== TOTAL_KEY && disabledKeys.has(key),
      getAccent: (key) => {
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
    const clearDropStates = () => tree.querySelectorAll(`.${cls("chip")}`).forEach((chip) => chip.classList.remove("drag-over-top", "drag-over-bottom"));
    const dropsBelow = (event, chip) => event.clientY - chip.getBoundingClientRect().top > chip.offsetHeight / 2;
    const shake = (node) => {
      if (!node) return;
      node.classList.add("error-shake");
      setTimeout(() => node.classList.remove("error-shake"), 400);
    };
    function drawLines() {
      tree.querySelector(`.${cls("svg-lines")}`)?.remove();
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", cls("svg-lines"));
      const chipByKey = new Map(
        [...tree.querySelectorAll(`.${cls("chip")}`)].map((chip) => [chip.dataset.key, chip])
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
          disabledKeys.has(parent) || disabledKeys.has(child) ? LINE_COLOR_DISABLED : LINE_COLOR
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
      chip.title = isTotal ? "Total is fixed at the top." : chipTitle || "Drag to reorder hierarchy levels. Click to hide/show this level.";
      const colorDot = createElement("span", cls("chip-color"), chip);
      const displayIndex = displayedKeys().indexOf(key);
      colorDot.style.backgroundColor = isTotal ? totalVisible ? depthColors[0] : DISABLED_DOT_COLOR : displayIndex < 0 ? DISABLED_DOT_COLOR : depthColors[displayIndex + 1];
      const label = createElement("span", cls("chip-label"), chip);
      label.textContent = isTotal ? "Total" : key;
      addHiddenBadge(chip, key);
      listen2(chip, "mouseenter", () => valueMenu.open(chip, key), signal);
      listen2(chip, "mouseleave", valueMenu.closeSoon, signal);
      if (isTotal) {
        listen2(chip, "click", () => {
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
      listen2(chip, "dragstart", (event) => {
        valueMenu.close();
        event.dataTransfer.setData("text/plain", key);
        event.dataTransfer.effectAllowed = "move";
        chip.classList.add("dragging");
        wasDragged = true;
      }, signal);
      listen2(chip, "dragend", () => {
        chip.classList.remove("dragging");
        clearDropStates();
        setTimeout(() => {
          wasDragged = false;
        }, 150);
      }, signal);
      listen2(chip, "dragover", (event) => {
        event.preventDefault();
        clearDropStates();
        chip.classList.add(dropsBelow(event, chip) ? "drag-over-bottom" : "drag-over-top");
      }, signal);
      listen2(chip, "dragleave", () => {
        chip.classList.remove("drag-over-top", "drag-over-bottom");
      }, signal);
      listen2(chip, "drop", (event) => {
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
      listen2(chip, "click", () => {
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
      activeKeys.forEach((key) => addChip(key, depthColors));
      requestAnimationFrame(() => requestAnimationFrame(drawLines));
    }
    const drag = { active: false, x: 0, y: 0, left: 0, top: 0 };
    listen2(container, "mousedown", (event) => {
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
    listen2(document, "mousemove", (event) => {
      if (!drag.active) return;
      container.style.left = `${drag.left + event.clientX - drag.x}px`;
      container.style.top = `${drag.top + event.clientY - drag.y}px`;
      event.preventDefault();
    }, signal);
    listen2(document, "mouseup", () => {
      if (!drag.active) return;
      drag.active = false;
      container.classList.remove("is-moving");
      onWidgetDragEnd?.();
    }, signal);
    function sync(next = {}) {
      activeKeys = [...next.activeKeys || model?.getActiveKeys?.() || activeKeys];
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

  // fixed/ggelato/srcjs/modules/gig/gig-selection.js
  function createGigHierarchyAdapter({
    state,
    selectedIndices,
    getTotalDimmed,
    setTotalDimmed,
    onSelectionChange,
    onStructureChange,
    onVisibilityChange
  }) {
    const findIndices = (key, value) => {
      if (key === TOTAL_KEY) {
        return state.series.map((series, index) => series._depth === 0 ? index : -1).filter((index) => index >= 0);
      }
      const depth = state.displayKeys().indexOf(key);
      if (depth < 0) return [];
      return state.series.map(
        (series, index) => series._depth === depth + 1 && String(series[key]).trim() === value ? index : -1
      ).filter((index) => index >= 0);
    };
    const isSelected = (key, value) => {
      const indices = findIndices(key, value);
      if (key === TOTAL_KEY) {
        if (state.isHidden(TOTAL_KEY, "Total")) return false;
        if (selectedIndices.size === 0) return !getTotalDimmed();
      }
      return indices.length > 0 && indices.every((index) => selectedIndices.has(index));
    };
    const setSelected = (key, value, selected) => {
      const indices = findIndices(key, value);
      if (!indices.length) return;
      if (key === TOTAL_KEY) {
        if (selected) {
          setTotalDimmed(false);
          if (selectedIndices.size > 0) indices.forEach((index) => selectedIndices.add(index));
        } else if (selectedIndices.size === 0) {
          setTotalDimmed(true);
        } else {
          indices.forEach((index) => selectedIndices.delete(index));
        }
        return;
      }
      indices.forEach((index) => {
        selected ? selectedIndices.add(index) : selectedIndices.delete(index);
      });
    };
    const valueControls = {
      getValues: (key) => state.valuesForKey(key),
      isSelected,
      setSelected,
      setSelectedMany: (key, values, selected) => {
        values.forEach((value) => setSelected(key, value, selected));
      },
      isHidden: (key, value) => state.isHidden(key, value),
      setHidden: (key, value, hidden) => state.setHidden(key, value, hidden),
      showAll: (key) => state.showAllFor(key),
      onSelectionChange,
      onVisibilityChange: () => {
        [...selectedIndices].forEach((index) => {
          if (state.isSeriesHidden(state.series[index])) selectedIndices.delete(index);
        });
        onVisibilityChange();
      }
    };
    const model = {
      getAllKeys: () => state.allKeys,
      getActiveKeys: () => state.activeKeys,
      getConstraints: () => state.constraints,
      getDisabledKeys: () => state.disabled,
      getTotalVisible: () => !state.isHidden(TOTAL_KEY, "Total"),
      setHierarchyState: (snapshot) => {
        state.activeKeys = [...snapshot.activeKeys];
        state.disabled = new Set(snapshot.disabledKeys);
        state.setHidden(TOTAL_KEY, "Total", !snapshot.totalVisible);
        state.rebuild();
        selectedIndices.clear();
        onStructureChange();
      },
      onTotalClick: () => {
        setSelected(TOTAL_KEY, "Total", !isSelected(TOTAL_KEY, "Total"));
        onSelectionChange();
      }
    };
    return { model, valueControls };
  }

  // fixed/ggelato/srcjs/modules/gig/gig-state.js
  var SEP = "";
  var INTERNAL_TIME_ORDER = ".ggelato_time_order";
  function createHierState(rows, structure, excludeKeys) {
    excludeKeys = [.../* @__PURE__ */ new Set([
      "Quarter",
      "Time",
      "Month",
      "Week",
      "Date",
      ".model",
      INTERNAL_TIME_ORDER,
      ...excludeKeys || []
    ])];
    const availableKeys = /* @__PURE__ */ new Set();
    rows.forEach(
      (row) => Object.keys(row || {}).forEach((key) => availableKeys.add(key))
    );
    let allKeys;
    let activeKeys;
    let constraints;
    if (structure) {
      const parsed = parseStructure(structure);
      allKeys = parsed.activeKeys.filter((key) => availableKeys.has(key));
      activeKeys = parsed.activeKeys.filter((key) => allKeys.includes(key));
      constraints = parsed.constraints.filter(
        (rule) => allKeys.includes(rule.parent) && allKeys.includes(rule.child)
      );
    } else {
      allKeys = [...availableKeys].filter((key) => !excludeKeys.includes(key)).filter((key) => rows.some(
        (row) => typeof row[key] === "string" && !isAggregatedValue(row[key])
      )).sort();
      activeKeys = [...allKeys].sort(
        (a, b) => rows.filter((row) => isAggregatedValue(row[a])).length - rows.filter((row) => isAggregatedValue(row[b])).length
      );
      constraints = [];
    }
    const canonicalId = (row) => allKeys.map(
      (key) => isAggregatedValue(row[key]) ? "AGG" : String(row[key]).trim()
    ).join("|");
    const seen = /* @__PURE__ */ new Map();
    rows.forEach((row) => {
      const id = canonicalId(row);
      if (!seen.has(id)) seen.set(id, row);
    });
    const seriesRows = [...seen.values()];
    const state = {
      allKeys,
      activeKeys,
      constraints,
      disabled: /* @__PURE__ */ new Set(),
      hiddenValues: /* @__PURE__ */ new Set(),
      canonicalId,
      series: [],
      displayKeys() {
        return this.activeKeys.filter((key) => !this.disabled.has(key));
      },
      depthColor(depth) {
        const colors = createDepthColors(this.displayKeys().length);
        return colors[Math.max(0, Math.min(depth, colors.length - 1))];
      },
      isValidOrder(order) {
        return this.constraints.every((rule) => {
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
        this.hiddenValues.forEach((id) => {
          if (id.split(SEP)[0] === key) count += 1;
        });
        return count;
      },
      showAllFor(key) {
        [...this.hiddenValues].forEach((id) => {
          if (id.split(SEP)[0] === key) this.hiddenValues.delete(id);
        });
      },
      isSeriesHidden(series) {
        if (series._depth === 0 && this.isHidden(TOTAL_KEY, "Total")) return true;
        return this.activeKeys.some(
          (key) => !isAggregatedValue(series[key]) && this.isHidden(key, String(series[key]).trim())
        );
      },
      valuesForKey(key) {
        if (key === TOTAL_KEY) return ["Total"];
        const values = /* @__PURE__ */ new Set();
        seriesRows.forEach((row) => {
          if (!isAggregatedValue(row[key])) values.add(String(row[key]).trim());
        });
        return [...values].sort();
      },
      rebuild() {
        const displayKeys = this.displayKeys();
        const best = /* @__PURE__ */ new Map();
        seriesRows.forEach((row) => {
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
          const pathId = depth === 0 ? "ROOT" : displayKeys.slice(0, depth).map((key) => String(row[key]).trim()).join("|");
          const aggregateCount = this.allKeys.reduce(
            (count, key) => count + Number(isAggregatedValue(row[key])),
            0
          );
          if (!best.has(pathId) || best.get(pathId).aggregateCount < aggregateCount) {
            best.set(pathId, {
              row,
              depth,
              pathId,
              aggregateCount,
              parentId: depth === 0 ? null : depth === 1 ? "ROOT" : displayKeys.slice(0, depth - 1).map((key) => String(row[key]).trim()).join("|"),
              canonicalId: this.canonicalId(row)
            });
          }
        });
        this.series = [...best.values()].map((item) => ({
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

  // fixed/ggelato/srcjs/modules/gig/gig-sunburst-renderer.js
  var SVG_NS = "http://www.w3.org/2000/svg";
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function truncateLabel(value, maxChars) {
    const text = String(value == null ? "" : value);
    return text.length > maxChars ? text.slice(0, Math.max(1, maxChars - 1)) + "\u2026" : text;
  }
  function labelFontSize(node) {
    if (node.data._depth === 0) return 13;
    if (node.data._depth === 1) return 11;
    const labelRadius = node.children ? (node.y0 + node.y1) / 2 : node.y1;
    const edgeLength = (node.x1 - node.x0) * labelRadius;
    return Math.max(0.75, Math.min(9, edgeLength * 0.68));
  }
  function hierarchyPath(state, node) {
    if (node.data._depth === 0) return ["Total"];
    return state.displayKeys().slice(0, node.data._depth).map((key) => node.data[key]).filter((value) => value != null && String(value).trim() !== "");
  }
  function pointInBox(x, y, box) {
    return x >= box.xMin && x <= box.xMax && y >= box.yMin && y <= box.yMax;
  }
  function pointInPolygon(point, vertices) {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      if (vertices[i].y > point.y !== vertices[j].y > point.y && point.x < (vertices[j].x - vertices[i].x) * (point.y - vertices[i].y) / (vertices[j].y - vertices[i].y) + vertices[i].x) {
        inside = !inside;
      }
    }
    return inside;
  }
  function renderSunburst(content, x, shared) {
    if (typeof d3 === "undefined") {
      throw new Error("D3 is required to render gig_sunburst.");
    }
    shared.hasSunburst = true;
    let treeNodes = [];
    let radiusStep = 55;
    let treeX = 0;
    let treeY = 0;
    let treeZoom = 1;
    let brushing = false;
    let brushPath = [];
    let brushShape = null;
    let destroyed = false;
    content.innerHTML = '<div class="gig-sun-wrap"><svg viewBox="-250 -250 500 500" preserveAspectRatio="xMidYMid meet"><rect x="-2500" y="-2500" width="5000" height="5000" fill="transparent" stroke="none"></rect><g class="gig-tree-group"></g></svg></div>';
    const svg = content.querySelector("svg");
    const group = d3.select(content).select(".gig-tree-group");
    function initialiseTree() {
      let maxDepth = 0;
      const flat = [];
      const byId = /* @__PURE__ */ new Map();
      shared.state.series.forEach((series, index) => {
        if (shared.state.isSeriesHidden(series)) return;
        const node = { ...series, _gIdx: index, children: [] };
        flat.push(node);
        byId.set(node._id, node);
        maxDepth = Math.max(maxDepth, node._depth);
      });
      const roots = [];
      flat.forEach((node) => {
        const parent = node._depth > 0 ? byId.get(node._parentId) : null;
        if (parent && parent._depth === node._depth - 1) {
          parent.children.push(node);
        } else {
          roots.push(node);
        }
      });
      if (!roots.length) {
        treeNodes = [];
        return;
      }
      const hierarchyRoot = roots.length === 1 ? roots[0] : { _id: "VIRTUAL_ROOT", _depth: -1, children: roots };
      radiusStep = Math.min(55, 170 / (maxDepth + 1));
      const rootD3 = d3.hierarchy(hierarchyRoot).sum((node) => node.children && node.children.length ? 0 : 1).sort((left, right) => right.value - left.value);
      const hasVirtualRoot = roots.length > 1;
      d3.partition().size([2 * Math.PI, 1])(rootD3);
      treeNodes = rootD3.descendants().filter((node) => node.data._id !== "VIRTUAL_ROOT").map((node) => {
        const depth = hasVirtualRoot ? node.depth - 1 : node.depth;
        node.y0 = depth === 0 ? 0 : depth * radiusStep;
        node.y1 = (depth + 1) * radiusStep;
        return node;
      });
    }
    function showTooltip(event, node) {
      const tooltip = shared.tooltipEl;
      const name = shared.state.label(node.data) || "Total";
      const path = hierarchyPath(shared.state, node);
      tooltip.innerHTML = '<div class="gig-sunburst-tooltip-name">' + escapeHtml(name) + "</div>" + (path.length > 1 ? '<div class="gig-sunburst-tooltip-path">' + path.map(escapeHtml).join(
        ' <span aria-hidden="true">\u203A</span> '
      ) + "</div>" : "");
      tooltip.style.opacity = 1;
      tooltip.style.left = event.clientX + 12 + "px";
      tooltip.style.top = event.clientY + 12 + "px";
    }
    function hideTooltip() {
      shared.tooltipEl.style.opacity = 0;
    }
    function updateStyles() {
      if (destroyed) return;
      treeNodes.forEach((node) => {
        const path = content.querySelector(
          '.gig-tree-node[data-gidx="' + node.data._gIdx + '"]'
        );
        if (!path) return;
        const style = shared.getStyle(node.data, node.data._gIdx);
        path.setAttribute(
          "fill",
          style.c === "rgba(200,200,200,0.15)" ? "#e2e8f0" : style.c
        );
        path.setAttribute("stroke", "#ffffff");
        path.setAttribute("stroke-width", style.w);
      });
      content.querySelectorAll(".gig-tree-label").forEach((label) => {
        label.classList.toggle("visible", shared.labelsOn.v);
      });
    }
    function renderTree() {
      group.selectAll("*").remove();
      const arc = d3.arc().startAngle((node) => node.x0).endAngle((node) => node.x1).innerRadius((node) => node.y0).outerRadius((node) => node.y1).padAngle(0);
      const nodes = group.selectAll("g.gig-node-group").data(treeNodes).enter().append("g").attr("class", "gig-node-group");
      nodes.append("path").attr("class", "gig-tree-node").attr("data-gidx", (node) => node.data._gIdx).attr("d", arc).on("click", (event, node) => {
        event.stopPropagation();
        if (shared.tools.box || shared.tools.lasso) return;
        shared.select(node.data._gIdx, event.shiftKey);
      }).on("mousemove", showTooltip).on("mouseleave", hideTooltip);
      nodes.append("text").attr("class", (node) => "gig-tree-label gig-tree-label-depth-" + node.data._depth + (shared.labelsOn.v ? " visible" : "")).attr("data-depth", (node) => node.data._depth).attr("transform", (node) => {
        if (node.data._depth === 0) return "";
        const angle = (node.x0 + node.x1) / 2;
        const radius = node.children ? (node.y0 + node.y1) / 2 : node.y1 + 5;
        const xPosition = radius * Math.sin(angle);
        const yPosition = -radius * Math.cos(angle);
        let rotation = angle * 180 / Math.PI - 90;
        if (rotation > 90 && rotation < 270) rotation += 180;
        return "translate(" + xPosition + "," + yPosition + ") rotate(" + rotation + ")";
      }).attr("dy", "0.35em").attr("text-anchor", (node) => {
        if (node.data._depth === 0) return "middle";
        if (node.children) return "middle";
        const rotation = (node.x0 + node.x1) / 2 * 180 / Math.PI - 90;
        return rotation > 90 && rotation < 270 ? "end" : "start";
      }).text((node) => {
        const name = shared.state.label(node.data) || "";
        if (node.data._depth === 0) return name;
        const fontSize = labelFontSize(node);
        const ringWidth = node.y1 - node.y0;
        const maxChars = Math.max(
          3,
          Math.floor((ringWidth - 6) / (fontSize * 0.56))
        );
        return truncateLabel(name, maxChars);
      }).style("font-size", (node) => labelFontSize(node) + "px").style("pointer-events", "none");
      updateStyles();
    }
    const zoom = d3.zoom().scaleExtent([0.1, 10]).filter((event) => !(shared.tools.box || shared.tools.lasso) && !event.ctrlKey && !event.button).on("zoom", (event) => {
      treeX = event.transform.x;
      treeY = event.transform.y;
      treeZoom = event.transform.k;
      group.attr("transform", event.transform);
    });
    d3.select(svg).call(zoom);
    d3.select(svg).on("click.ggelatoSunburst", () => {
      if (shared.tools.box || shared.tools.lasso) return;
      shared.select(-1, false);
    });
    function viewBoxCoordinates(clientX, clientY) {
      const bounds = svg.getBoundingClientRect();
      const scale = Math.min(bounds.width / 500, bounds.height / 500);
      const offsetX = (bounds.width - 500 * scale) / 2;
      const offsetY = (bounds.height - 500 * scale) / 2;
      return {
        x: (clientX - bounds.left - offsetX) / scale - 250,
        y: (clientY - bounds.top - offsetY) / scale - 250
      };
    }
    function onMouseDown(event) {
      if (!(shared.tools.box || shared.tools.lasso)) return;
      brushing = true;
      brushPath = [viewBoxCoordinates(event.clientX, event.clientY)];
      brushShape = document.createElementNS(
        SVG_NS,
        shared.tools.box ? "rect" : "path"
      );
      brushShape.setAttribute("fill", "rgba(0,114,178,0.2)");
      brushShape.setAttribute("stroke", "#0072B2");
      svg.appendChild(brushShape);
      event.stopPropagation();
    }
    function onMouseMove(event) {
      if (!brushing || !brushShape) return;
      const point = viewBoxCoordinates(event.clientX, event.clientY);
      brushPath.push(point);
      if (shared.tools.box) {
        brushShape.setAttribute("x", Math.min(brushPath[0].x, point.x));
        brushShape.setAttribute("y", Math.min(brushPath[0].y, point.y));
        brushShape.setAttribute("width", Math.abs(point.x - brushPath[0].x));
        brushShape.setAttribute("height", Math.abs(point.y - brushPath[0].y));
      } else {
        brushShape.setAttribute(
          "d",
          "M " + brushPath.map((item) => item.x + "," + item.y).join(" L ") + " Z"
        );
      }
    }
    function onMouseUp(event) {
      if (!brushing) return;
      brushing = false;
      if (brushShape && brushShape.parentNode === svg) {
        svg.removeChild(brushShape);
      }
      brushShape = null;
      if (brushPath.length < 2) return;
      const finalPoint = brushPath[brushPath.length - 1];
      const box = {
        xMin: Math.min(brushPath[0].x, finalPoint.x),
        xMax: Math.max(brushPath[0].x, finalPoint.x),
        yMin: Math.min(brushPath[0].y, finalPoint.y),
        yMax: Math.max(brushPath[0].y, finalPoint.y)
      };
      const useBox = shared.tools.box;
      const hits = [];
      treeNodes.forEach((node) => {
        const angle = (node.x0 + node.x1) / 2;
        const radii = [
          (node.y0 + node.y1) / 2,
          node.y0 + 5,
          node.y1 - 5
        ];
        const hit = radii.some((radius) => {
          const xPosition = radius * Math.sin(angle) * treeZoom + treeX;
          const yPosition = -radius * Math.cos(angle) * treeZoom + treeY;
          return useBox ? pointInBox(xPosition, yPosition, box) : pointInPolygon({ x: xPosition, y: yPosition }, brushPath);
        });
        if (hit) hits.push(node.data._gIdx);
      });
      shared.brush(hits, event.shiftKey);
    }
    svg.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    const resetZoom = () => {
      d3.select(svg).call(zoom.transform, d3.zoomIdentity);
      treeX = 0;
      treeY = 0;
      treeZoom = 1;
    };
    shared.resetFns.push(resetZoom);
    function update(full) {
      if (full) {
        initialiseTree();
        renderTree();
      } else {
        updateStyles();
      }
    }
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      hideTooltip();
      d3.select(svg).on(".zoom", null).on(".ggelatoSunburst", null);
      svg.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      const resetIndex = shared.resetFns.indexOf(resetZoom);
      if (resetIndex >= 0) shared.resetFns.splice(resetIndex, 1);
    }
    initialiseTree();
    renderTree();
    return {
      update,
      resize() {
      },
      destroy
    };
  }

  // fixed/ggelato/srcjs/api/ggelato-api.js
  var API_BUILD = "2026-07-28.5";
  window.ggelatoAPI = Object.freeze({
    API_BUILD,
    HIERARCHY_WIDGET_BUILD,
    TOTAL_KEY,
    createDepthColors,
    createGigHierarchyAdapter,
    createHierState,
    createHierarchyWidget,
    dataFrameToRows,
    parseStructure,
    renderSunburst
  });
})();
