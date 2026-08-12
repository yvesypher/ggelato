/* Search, selection and visibility menu used by the shared hierarchy widget. */

const EYE_ICON = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF_ICON = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

export function valueSet(store, key) {
  if (!store.has(key)) store.set(key, new Set());
  return store.get(key);
}

export function hasAnyValues(store) {
  return [...store.values()].some(values => values.size > 0);
}

export function setValueState(store, key, value, enabled) {
  const values = valueSet(store, key);
  enabled ? values.add(String(value)) : values.delete(String(value));
  if (!values.size) store.delete(key);
}

export function createValueControls({
  deselectedValues,
  hiddenValues,
  getValues,
  onSelectionChange,
  onVisibilityChange
}) {
  return {
    getValues,
    isSelected: (key, value) =>
      !deselectedValues.get(key)?.has(String(value)),
    setSelected: (key, value, selected) =>
      setValueState(deselectedValues, key, value, !selected),
    setSelectedMany: (key, values, selected) =>
      values.forEach(value =>
        setValueState(deselectedValues, key, value, !selected)
      ),
    isHidden: (key, value) =>
      hiddenValues.get(key)?.has(String(value)) || false,
    setHidden: (key, value, hidden) =>
      setValueState(hiddenValues, key, value, hidden),
    showAll: key => hiddenValues.delete(key),
    onSelectionChange,
    onVisibilityChange
  };
}

function listen(node, type, handler, signal) {
  node.addEventListener(type, handler, signal ? { signal } : undefined);
}

export function createValueMenu({
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
  onHiddenStateChange = () => {}
}) {
  const cls = suffix => `${classPrefix}-${suffix}`;
  const createElement = (tag, className, target = parent) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    target?.appendChild(node);
    return node;
  };

  const menu = createElement("div", cls("value-dropdown"));
  let hideTimer = null;
  let anchorChip = null;

  const resolveNode = value =>
    typeof value === "function" ? value() : value;

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
  listen(menu, "mousedown", event => event.stopPropagation(), signal);
  listen(menu, "click", event => event.stopPropagation(), signal);

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

    // Position against the plot overlay and protect the complete draggable
    // hierarchy panel, not only the hovered chip or scaled inner widget.
    const viewportWidth = window.innerWidth ||
      document.documentElement.clientWidth || protectedRect.right;
    const viewportHeight = window.innerHeight ||
      document.documentElement.clientHeight || protectedRect.bottom;
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
    const clamp = (value, minimum, maximum) =>
      Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
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
    let placement = candidates.find(candidate => candidate.fits);
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
      ].map(region => ({
        ...region,
        width: Math.max(0, region.right - region.left),
        height: Math.max(0, region.bottom - region.top)
      }));
      const region = regions
        .filter(candidate => candidate.width >= 96 && candidate.height >= 96)
        .sort((a, b) => b.width * b.height - a.width * a.height)[0];

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
    menu.dataset.protectedElement =
      protectedNode.classList?.contains("fridge-hierarchy-panel")
        ? "fridge-hierarchy-panel"
        : protectedNode.className || protectedNode.tagName;
    menu.style.left = `${viewportLeft - parentRect.left +
      (positioningParent.scrollLeft || 0)}px`;
    menu.style.top = `${viewportTop - parentRect.top +
      (positioningParent.scrollTop || 0)}px`;
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
      note.textContent = "Level is hidden — click its chip to restore it.";
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

    function renderRows() {
      list.replaceChildren();
      filteredValues().forEach(value => {
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
          values.forEach(value =>
            valueControls.setSelected?.(key, value, selectAll.checked)
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
