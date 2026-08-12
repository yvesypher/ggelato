/* Toolbar markup and controls shared by the three gig widgets. */

const SELECTION_ICONS = {
  single: '<svg class="gig-icon-svg" viewBox="0 0 24 24"><circle cx="8" cy="8" r="3.5" fill="#333"/><circle cx="16" cy="8" r="3.5" fill="#ccc"/><circle cx="8" cy="16" r="3.5" fill="#ccc"/><circle cx="16" cy="16" r="3.5" fill="#ccc"/></svg>',
  multiple: '<svg class="gig-icon-svg" viewBox="0 0 24 24"><circle cx="8" cy="8" r="3.5" fill="#333"/><circle cx="16" cy="8" r="3.5" fill="#333"/><circle cx="8" cy="16" r="3.5" fill="#333"/><circle cx="16" cy="16" r="3.5" fill="#333"/></svg>',
  inverse: '<svg class="gig-icon-svg" viewBox="0 0 24 24"><circle cx="8" cy="8" r="3.5" fill="#ccc"/><circle cx="16" cy="8" r="3.5" fill="#333"/><circle cx="8" cy="16" r="3.5" fill="#333"/><circle cx="16" cy="16" r="3.5" fill="#333"/></svg>',
  inverseAll: '<svg class="gig-icon-svg" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#333" stroke-width="1.5"/><circle cx="8" cy="8" r="2.5" fill="#ccc"/><circle cx="16" cy="8" r="2.5" fill="#333"/><circle cx="8" cy="16" r="2.5" fill="#333"/><circle cx="16" cy="16" r="2.5" fill="#333"/></svg>',
  hierarchy: '<svg class="gig-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="16" cy="8" r="2.5" fill="#333" stroke="none"/><circle cx="8" cy="16" r="2.5" fill="#333" stroke="none"/><circle cx="16" cy="16" r="2.5" fill="#333" stroke="none"/><circle cx="8" cy="8" r="2.5" fill="#ccc" stroke="none"/><path d="M16 8 L8 16 M16 8 L16 16" stroke="#333" stroke-width="1.5"/></svg>'
};

const TOOL_ICON = {
  box: '<svg class="gig-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9 V6 a2 2 0 0 1 2-2 h3"/><path d="M15 4 h3 a2 2 0 0 1 2 2 v3"/><path d="M20 15 v3 a2 2 0 0 1 -2 2 h-3"/><path d="M9 20 H6 a2 2 0 0 1 -2-2 v-3"/></svg>',
  reset: '<svg class="gig-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>',
  lasso: '<svg class="gig-icon-svg" viewBox="2 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M 7 21 L 9.5 16.5"/><path d="M 9.5 16.5 C 4 11 7 5 15 5 C 21 5 23 11 20 15 C 18 17 13 18 9.5 16.5"/><path d="M 9.5 16.5 C 9 17 8 17 8 16"/></svg>',
  labels: '<svg class="gig-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
  grip: '<svg viewBox="0 0 14 20" fill="currentColor" width="14" height="20" style="pointer-events:none;"><circle cx="4" cy="4" r="1.5"/><circle cx="10" cy="4" r="1.5"/><circle cx="4" cy="10" r="1.5"/><circle cx="10" cy="10" r="1.5"/><circle cx="4" cy="16" r="1.5"/><circle cx="10" cy="16" r="1.5"/></svg>'
};

export function gigToolbarMarkup({
  includeLabels = false,
  includeScale = false,
  inverseFirst = "Within Current Level",
  inverseSecond = "Across All Levels"
} = {}) {
  return `
  <div class="gig-toolbar gig-tb-docked-left">
    <div class="gig-tb-handle-wrap">
      <div class="gig-tb-handle" title="Drag to move, click for menu">${TOOL_ICON.grip}</div>
      <div class="gig-tb-menu" data-role="tbmenu">
        <button data-tbmode="docked-top">Dock Top</button>
        <button data-tbmode="float-h">Float Horizontal</button>
        <button data-tbmode="float-v">Float Vertical</button>
        <button data-tbmode="minimized">Minimize</button>
        <div class="gig-tb-menu-sep"></div>
        <button data-tbmode="docked-left" class="gig-tb-menu-primary">Dock Left (Reset)</button>
      </div>
    </div>
    <div class="gig-tool-dropdown">
      <button class="gig-tool-btn" data-role="selmode" title="Selection Mode"></button>
      <div class="gig-tool-menu" data-role="selmenu">
        <a data-mode="single">Single Selection</a>
        <a data-mode="multiple">Multiple Selection</a>
        <div class="gig-has-sub">
          <span>Inverse Selection</span><span class="gig-sub-arrow">&#9656;</span>
          <div class="gig-tool-submenu">
            <a data-mode="inverse">${inverseFirst}</a>
            <a data-mode="inverseAll">${inverseSecond}</a>
          </div>
        </div>
        <a data-mode="hierarchy">Hierarchical Selection</a>
      </div>
    </div>
    <button class="gig-tool-btn" data-role="box" title="Box Selection">${TOOL_ICON.box}</button>
    <button class="gig-tool-btn" data-role="lasso" title="Lasso Selection">${TOOL_ICON.lasso}</button>
    ${includeLabels
      ? `<button class="gig-tool-btn active" data-role="labels" title="Show/Hide Labels">${TOOL_ICON.labels}</button>`
      : ""}
    <button class="gig-tool-btn" data-role="reset" title="Reset">${TOOL_ICON.reset}</button>
    ${includeScale ? `
      <div class="gig-separator" data-role="scalegroup"></div>
      <label class="gig-data-switch" data-role="scalegroup" title="Switch Data Scale">
        <input type="checkbox" data-role="scaletoggle" checked>
        <div class="gig-slider">
          <span class="gig-label-text gig-label-scaled">Scaled</span>
          <span class="gig-label-text gig-label-original">Original</span>
          <div class="gig-knob"></div>
        </div>
      </label>` : ""}
  </div>`;
}

export function selectionIcon(mode) {
  return SELECTION_ICONS[mode] || SELECTION_ICONS.single;
}

export function initGigToolbarControls({
  root,
  signal,
  onSelectionModeChange = () => {},
  onBrushModeChange = () => {}
}) {
  const query = selector => root.querySelector(selector);
  const queryAll = selector => [...root.querySelectorAll(selector)];
  const listen = (node, type, handler) =>
    node.addEventListener(type, handler, signal ? { signal } : undefined);
  const selectionButton = query('[data-role="selmode"]');
  const selectionMenu = query('[data-role="selmenu"]');
  const boxButton = query('[data-role="box"]');
  const lassoButton = query('[data-role="lasso"]');
  let mode = "single";
  let brushMode = null;

  const modeNames = {
    single: "Single",
    multiple: "Multiple",
    inverse: "Inverse - Peers Only",
    inverseAll: "Inverse - Entire Hierarchy",
    hierarchy: "Hierarchical"
  };

  function setSelectionMode(nextMode) {
    mode = nextMode || "single";
    queryAll(".gig-tool-menu a").forEach(link => {
      link.classList.toggle("active-mode", link.dataset.mode === mode);
    });
    query(".gig-tool-menu .gig-has-sub")
      ?.classList.toggle("active-mode", mode.startsWith("inverse"));
    selectionButton.innerHTML = selectionIcon(mode);
    selectionButton.title = `Selection Mode: ${modeNames[mode] || mode}`;
    onSelectionModeChange(mode);
  }

  function setBrushMode(nextMode) {
    brushMode = nextMode === brushMode ? null : nextMode;
    boxButton.classList.toggle("active", brushMode === "box");
    lassoButton.classList.toggle("active", brushMode === "lasso");
    onBrushModeChange({ box: brushMode === "box", lasso: brushMode === "lasso" });
  }

  listen(selectionButton, "click", event => {
    event.stopPropagation();
    selectionMenu.classList.toggle("show");
  });
  queryAll('.gig-tool-menu a[data-mode]').forEach(link => {
    listen(link, "click", () => {
      setSelectionMode(link.dataset.mode);
      selectionMenu.classList.remove("show");
    });
  });
  listen(window, "click", event => {
    if (!event.target.closest(".gig-tool-dropdown")) selectionMenu.classList.remove("show");
  });
  listen(boxButton, "click", () => setBrushMode("box"));
  listen(lassoButton, "click", () => setBrushMode("lasso"));

  setSelectionMode("single");
  onBrushModeChange({ box: false, lasso: false });
  return {
    reset() {
      brushMode = null;
      boxButton.classList.remove("active");
      lassoButton.classList.remove("active");
      onBrushModeChange({ box: false, lasso: false });
      setSelectionMode("single");
    },
    setSelectionMode,
    getSelectionMode: () => mode,
    getBrushMode: () => brushMode
  };
}
