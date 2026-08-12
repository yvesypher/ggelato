/* Drag, resize and edge-docking behavior for the hierarchy widget. */

export function pinHierarchyWidgetPosition(container, host) {
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

function listen(node, type, handler, signal) {
  node.addEventListener(type, handler, signal ? { signal } : undefined);
}

export function calculateHierarchyWidgetFit(
  containerWidth,
  containerHeight,
  contentWidth,
  contentHeight
) {
  const width = Math.max(1, contentWidth);
  const height = Math.max(1, contentHeight);
  const scale = Math.min(containerWidth / width, containerHeight / height);
  return {
    scale,
    offsetX: (containerWidth - width * scale) / 2,
    offsetY: (containerHeight - height * scale) / 2
  };
}

export function attachHierarchyWidgetResize({
  container,
  inner,
  host,
  signal,
  onResizeEnd,
  classPrefix = "hierarchy",
  minSize = 60,
  defaultScale = 0.75
}) {
  if (!container || !inner || !host) return null;

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
  let baseWidth = 0;
  let baseHeight = 0;
  let initialSizeApplied = false;

  const fitInner = () => {
    if (!baseWidth || !baseHeight) return;
    const { scale, offsetX, offsetY } = calculateHierarchyWidgetFit(
      container.clientWidth,
      container.clientHeight,
      baseWidth,
      baseHeight
    );
    inner.style.transformOrigin = "top left";
    inner.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  };

  const refreshNatural = ({ resizeContainer = false } = {}) => {
    inner.style.transform = "none";
    baseWidth = Math.max(1, inner.scrollWidth || inner.offsetWidth);
    baseHeight = Math.max(1, inner.scrollHeight || inner.offsetHeight);
    if (!initialSizeApplied || resizeContainer) {
      container.style.width = `${baseWidth * defaultScale}px`;
      container.style.height = `${baseHeight * defaultScale}px`;
      initialSizeApplied = true;
    }
    fitInner();
  };

  directions.forEach(direction => {
    const handle = document.createElement("div");
    handle.className = `${classPrefix}-resize-handle ${direction}`;
    container.appendChild(handle);
    listen(handle, "mousedown", event => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const pinned = pinHierarchyWidgetPosition(container, host);
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
    }, signal);
  });

  listen(document, "mousemove", event => {
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
      width = height * state.aspect;
      if (direction.includes("w")) left = state.left + state.width - width;
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
    fitInner();
  }, signal);

  listen(document, "mouseup", () => {
    if (!state.direction) return;
    state.direction = null;
    container.classList.remove("is-resizing");
    onResizeEnd?.();
  }, signal);

  const setupTimer = setTimeout(() => {
    refreshNatural();
    onResizeEnd?.();
  }, 0);
  const resizeObserver = typeof ResizeObserver === "undefined"
    ? null
    : new ResizeObserver(fitInner);
  resizeObserver?.observe(container);

  const mutationObserver = typeof MutationObserver === "undefined"
    ? null
    : new MutationObserver(() => refreshNatural());
  mutationObserver?.observe(inner, { childList: true, subtree: true });

  signal?.addEventListener("abort", () => {
    clearTimeout(setupTimer);
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
  }, { once: true });

  return { refreshNatural, fitInner };
}

export function createHierarchyWidgetDocking({
  host,
  container,
  signal,
  applySpace,
  getBounds = () => host.getBoundingClientRect(),
  gap = 20,
  innerGap = 12,
  threshold = 30,
  initialSide = "right"
}) {
  let dockedSide = initialSide;

  const band = () => ((dockedSide === "left" || dockedSide === "right")
    ? container.offsetWidth
    : container.offsetHeight) + gap + innerGap;

  function snapWidget() {
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
      .reduce((a, b) => distances[a] <= distances[b] ? a : b);
    const nextSide = distances[nearest] < threshold ? nearest : null;
    const changed = nextSide !== dockedSide;
    dockedSide = nextSide;
    if (dockedSide) snapWidget();
    if (changed) apply();
  }

  function setSide(side) {
    dockedSide = side || null;
    if (dockedSide) snapWidget();
    apply();
  }

  const observer = typeof ResizeObserver === "undefined"
    ? null
    : new ResizeObserver(() => {
      if (dockedSide) snapWidget();
    });
  observer?.observe(host);
  signal?.addEventListener("abort", () => observer?.disconnect(), { once: true });

  return {
    handleDragEnd,
    applyInitial(...extra) {
      if (dockedSide) snapWidget();
      apply(...extra);
    },
    refresh() {
      if (!dockedSide) return;
      snapWidget();
      apply();
    },
    setSide,
    getSide: () => dockedSide
  };
}
