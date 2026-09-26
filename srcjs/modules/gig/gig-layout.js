/* Toolbar/hierarchy-widget/plot spacing for the gig widgets. */

import {
  attachHierarchyWidgetResize,
  createHierarchyWidgetDocking
} from "../core/floating-widget.js";

export function calculateSquarePlotGrid(
  availableWidth,
  availableHeight,
  yAxisGutter = 44,
  xAxisGutter = 36
) {
  const width = Math.max(0, Number(availableWidth) || 0);
  const height = Math.max(0, Number(availableHeight) || 0);
  const side = Math.max(0, Math.floor(Math.min(
    width - yAxisGutter,
    height - xAxisGutter
  )));
  return {
    side,
    width: side + yAxisGutter,
    height: side + xAxisGutter
  };
}

function listen(node, type, handler, signal) {
  node.addEventListener(type, handler, signal ? { signal } : undefined);
}

export function initGigChrome({
  root,
  main,
  hierarchyWidget,
  signal,
  onResize = () => {}
}) {
  const toolbar = root.querySelector(".gig-toolbar");
  const container = hierarchyWidget?.container;

  if (!toolbar || !main) return null;

  let toolbarMode = "docked-left";
  let dockSide = null;
  let dockBand = 0;
  let resizeTimer = null;
  const insets = { left: 64, right: 8, top: 8, bottom: 8 };

  function relayout() {
    const toolbarLeft = toolbarMode === "docked-left" ? 64 : 10;
    const toolbarTop = toolbarMode === "docked-top" ? 64 : 8;
    main.style.paddingLeft = `${(dockSide === "left" ? dockBand : 0) + toolbarLeft}px`;
    main.style.paddingRight = `${(dockSide === "right" ? dockBand : 0) + 10}px`;
    main.style.paddingTop = `${(dockSide === "top" ? dockBand : 0) + toolbarTop}px`;
    main.style.paddingBottom = `${(dockSide === "bottom" ? dockBand : 0) + 8}px`;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(onResize, 60);
  }

  const getBounds = () => {
    const rect = root.getBoundingClientRect();
    return {
      left: rect.left + insets.left,
      right: rect.right - insets.right,
      top: rect.top + insets.top,
      bottom: rect.bottom - insets.bottom
    };
  };

  const docking = container
    ? createHierarchyWidgetDocking({
      host: root,
      container,
      signal,
      getBounds,
      gap: 8,
      innerGap: 8,
      initialSide: "right",
      applySpace: (side, band) => {
        dockSide = side;
        dockBand = band;
        container.classList.toggle("docked", Boolean(side));
        relayout();
      }
    })
    : {
      handleDragEnd() {},
      applyInitial: relayout,
      refresh() {},
      setSide() {}
    };

  const resizing = container
    ? attachHierarchyWidgetResize({
      container,
      inner: hierarchyWidget.inner,
      host: root,
      signal,
      defaultScale: 1,
      onResizeEnd: () => docking.refresh()
    })
    : null;

  function setToolbarMode(mode) {
    toolbarMode = mode;
    toolbar.classList.remove(
      "gig-tb-docked-left",
      "gig-tb-docked-top",
      "gig-tb-float-h",
      "gig-tb-float-v",
      "gig-tb-minimized"
    );
    toolbar.classList.add(`gig-tb-${mode}`);
    if (mode === "docked-left" || mode === "docked-top") {
      toolbar.style.left = "";
      toolbar.style.top = "";
      toolbar.style.right = "";
      toolbar.style.bottom = "";
    }
    insets.left = mode === "docked-left" ? 64 : 8;
    insets.top = mode === "docked-top" ? 64 : 8;
    relayout();
    docking.refresh();
  }

  const handle = root.querySelector(".gig-tb-handle");
  const menu = root.querySelector('[data-role="tbmenu"]');
  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  listen(handle, "mousedown", event => {
    dragging = true;
    moved = false;
    startX = event.clientX;
    startY = event.clientY;
    startLeft = toolbar.offsetLeft;
    startTop = toolbar.offsetTop;
    event.preventDefault();
  }, signal);
  listen(window, "mousemove", event => {
    if (!dragging) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
    if (!moved && toolbarMode !== "float-v" && toolbarMode !== "float-h") {
      setToolbarMode(toolbarMode === "docked-top" ? "float-h" : "float-v");
    }
    moved = true;
    toolbar.style.left = `${Math.max(
      0,
      Math.min(startLeft + dx, root.clientWidth - toolbar.offsetWidth)
    )}px`;
    toolbar.style.top = `${Math.max(
      0,
      Math.min(startTop + dy, root.clientHeight - toolbar.offsetHeight)
    )}px`;
    toolbar.style.right = "auto";
    toolbar.style.bottom = "auto";
  }, signal);
  listen(window, "mouseup", () => {
    if (!dragging) return;
    dragging = false;
    if (!moved) {
      if (toolbar.classList.contains("gig-tb-minimized")) {
        setToolbarMode("docked-left");
      } else {
        menu.classList.toggle("show");
      }
    }
  }, signal);
  menu.querySelectorAll("button").forEach(button => {
    listen(button, "click", event => {
      event.stopPropagation();
      menu.classList.remove("show");
      setToolbarMode(button.dataset.tbmode);
    }, signal);
  });
  listen(toolbar, "click", () => {
    if (toolbar.classList.contains("gig-tb-minimized")) setToolbarMode("docked-left");
  }, signal);
  listen(window, "click", event => {
    if (!event.target.closest(".gig-tb-handle-wrap")) menu.classList.remove("show");
  }, signal);

  relayout();
  requestAnimationFrame(() => docking.applyInitial());
  signal?.addEventListener("abort", () => clearTimeout(resizeTimer), { once: true });

  return {
    hierarchyWidget: {
      refreshNatural: resizing?.refreshNatural,
      handleDragEnd: docking.handleDragEnd,
      setDock: docking.setSide
    },
    handleHierarchyDragEnd: docking.handleDragEnd,
    relayout,
    setToolbarMode
  };
}
