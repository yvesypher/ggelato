
export const DEPTH_COLORS = ['#e76f51', '#f4a261', '#e9c46a', '#2a9d8f', '#264653'];
export const getDepthColor = (depth) => DEPTH_COLORS[depth % DEPTH_COLORS.length];

const SEP = '\u0001'; // internal separator for "key|value" hidden entries

export const TOTAL_KEY = '__gig_total__';

export function safeConvert(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === 'object') {
    const keys = Object.keys(data);
    if (keys.length === 0) return [];
    const firstCol = data[keys[0]];
    const length = Array.isArray(firstCol) ? firstCol.length : 0;
    if (length === 0) return [];
    const output = [];
    for (let i = 0; i < length; i++) {
      const row = {};
      keys.forEach(k => row[k] = data[k] ? data[k][i] : null);
      output.push(row);
    }
    return output;
  }
  return [];
}

export function isAgg(val) {
  if (val === null || val === undefined) return true;
  const s = String(val).trim().toLowerCase();
  return s === '' || s === '<aggregated>' || s === 'na';
}

// Parse hierarchical syntax e.g. "(State/Region)*Purpose"
export function parseHierarchy(str) {
  const keys = [];
  const constraints = [];
  if (str) {
    const clean = String(str).replace(/[\(\)\s]/g, '');
    clean.split('*').forEach(block => {
      if (!block) return;
      const nested = block.split('/').filter(Boolean);
      keys.push(...nested);
      for (let i = 0; i < nested.length - 1; i++) {
        constraints.push({ parent: nested[i], child: nested[i + 1] });
      }
    });
  }
  return { keys, constraints };
}

export function createHierState(rows, hierarchyStr, excludeKeys) {
  excludeKeys = excludeKeys || ['Quarter', 'Time', 'Month', 'Week', 'Date', '.model'];
  const sample = rows[0] || {};
  const allKeys = Object.keys(sample)
    .filter(k => typeof sample[k] === 'string' && !excludeKeys.includes(k))
    .sort();

  let activeKeys, constraints;
  if (hierarchyStr) {
    const p = parseHierarchy(hierarchyStr);
    activeKeys = p.keys.filter(k => allKeys.includes(k));
    constraints = p.constraints.filter(r => allKeys.includes(r.parent) && allKeys.includes(r.child));
  } else {
    activeKeys = [...allKeys].sort((a, b) =>
      rows.filter(d => isAgg(d[a])).length - rows.filter(d => isAgg(d[b])).length);
    constraints = [];
  }

  const canonicalId = (row) => allKeys.map(k => isAgg(row[k]) ? 'AGG' : String(row[k]).trim()).join('|');

  const seen = new Map();
  rows.forEach(r => {
    const id = canonicalId(r);
    if (!seen.has(id)) seen.set(id, r);
  });
  const seriesRows = Array.from(seen.values());

  const state = {
    allKeys,
    activeKeys,
    constraints,
    disabled: new Set(),
    hiddenValues: new Set(),   // entries "key<SEP>value" hidden from the plots
    canonicalId,
    series: [],

    displayKeys() {
      return this.activeKeys.filter(k => !this.disabled.has(k));
    },

    isValidOrder(order) {
      for (const rule of this.constraints) {
        const p = order.indexOf(rule.parent);
        const c = order.indexOf(rule.child);
        if (p !== -1 && c !== -1 && p > c) return false;
      }
      return true;
    },

    // --- hidden-value helpers -------------------------------------------
    isHidden(key, value) { return this.hiddenValues.has(key + SEP + value); },
    toggleHidden(key, value) {
      const id = key + SEP + value;
      if (this.hiddenValues.has(id)) this.hiddenValues.delete(id);
      else this.hiddenValues.add(id);
    },
    hiddenCountFor(key) {
      let n = 0;
      this.hiddenValues.forEach(id => { if (id.split(SEP)[0] === key) n++; });
      return n;
    },
    showAllFor(key) {
      Array.from(this.hiddenValues).forEach(id => {
        if (id.split(SEP)[0] === key) this.hiddenValues.delete(id);
      });
    },
    isSeriesHidden(d) {
      if (d._depth === 0 && this.isHidden(TOTAL_KEY, 'Total')) return true;
      for (const k of this.activeKeys) {
        if (!isAgg(d[k]) && this.isHidden(k, String(d[k]).trim())) return true;
      }
      return false;
    },
    valuesForKey(key) {
      if (key === TOTAL_KEY) return ['Total'];
      const set = new Set();
      seriesRows.forEach(r => { if (!isAgg(r[key])) set.add(String(r[key]).trim()); });
      return Array.from(set).sort();
    },

    rebuild() {
      const dk = this.displayKeys();
      const best = new Map();

      seriesRows.forEach((row) => {
        let depth = dk.length;
        for (let j = 0; j < dk.length; j++) {
          if (isAgg(row[dk[j]])) { depth = j; break; }
        }
        let valid = true;
        for (let j = depth; j < dk.length; j++) {
          if (!isAgg(row[dk[j]])) { valid = false; break; }
        }
        if (!valid) return;

        const pathId = depth === 0 ? 'ROOT'
          : dk.slice(0, depth).map(k => String(row[k]).trim()).join('|');
        let aggCount = 0;
        for (const k of this.allKeys) { if (isAgg(row[k])) aggCount++; }

        if (!best.has(pathId) || best.get(pathId).aggCount < aggCount) {
          best.set(pathId, {
            row, depth, pathId, aggCount,
            parentId: depth === 0 ? null
              : (depth === 1 ? 'ROOT' : dk.slice(0, depth - 1).map(k => String(row[k]).trim()).join('|')),
            canonicalId: this.canonicalId(row)
          });
        }
      });

      this.series = Array.from(best.values()).map(d => ({
        ...d.row,
        _depth: d.depth,
        _id: d.pathId,
        _parentId: d.parentId,
        _canonicalId: d.canonicalId
      }));
      this.series.sort((a, b) => a._depth - b._depth);
      return this.series;
    },

    label(d) {
      const dk = this.displayKeys();
      if (d._depth === 0) return 'Total';
      return d[dk[d._depth - 1]];
    }
  };

  state.rebuild();
  return state;
}

const ICON_EYE = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICON_EYE_OFF = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

export function renderLegend(container, state, onChange, hooks) {
  if (!container) return;
  hooks = hooks || {};
  container.innerHTML = '';
  container.classList.add('gig-hier-legend');

  const BASE_INDENT = 22;   // room for the connector track on the left
  let hideTimer = null;

  // ---- dropdown (one per legend, repositioned per chip) -----------------
  const dd = document.createElement('div');
  dd.className = 'gig-hier-dropdown';
  dd.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  dd.addEventListener('mouseleave', () => {
    hideTimer = setTimeout(() => dd.classList.remove('visible'), 250);
  });
  dd.addEventListener('click', e => e.stopPropagation());

  function refreshChipBadges() {
    container.querySelectorAll('.gig-hier-chip').forEach(chip => {
      const key = chip.dataset.key;
      const badge = chip.querySelector('.gig-hidden-badge');
      const n = state.hiddenCountFor(key);
      if (n > 0) {
        if (badge) badge.textContent = n;
        else {
          const b = document.createElement('span');
          b.className = 'gig-hidden-badge';
          b.title = n + ' hidden from plot';
          b.textContent = n;
          chip.appendChild(b);
        }
      } else if (badge) {
        badge.remove();
      }
    });
  }

  function populateDropdown(key) {
    const isTotal = key === TOTAL_KEY;
    const allValues = state.valuesForKey(key);
    const canCheck = typeof hooks.isChecked === 'function' && typeof hooks.onCheck === 'function';
    const levelDisabled = !isTotal && state.disabled.has(key);
    // Checkboxes take the chip colour of this hierarchy level, so a ticked
    // box is visually tied to the lines it highlights in the plots.
    const accent = isTotal ? getDepthColor(0)
      : getDepthColor(state.activeKeys.indexOf(key) + 1);
    let filter = '';

    dd.innerHTML = '';

    // Header: variable name (+ "Show all" when values are hidden)
    const head = document.createElement('div');
    head.className = 'gig-dd-head';
    head.innerHTML = '<span class="gig-dd-title">' + (isTotal ? 'Total' : key) + '</span>';
    if (state.hiddenCountFor(key) > 0) {
      const bShow = document.createElement('button');
      bShow.className = 'gig-dd-action gig-dd-showall';
      bShow.textContent = 'Show all';
      bShow.title = 'Unhide all values of ' + key;
      bShow.onclick = () => {
        state.showAllFor(key);
        if (hooks.onVisibilityChange) hooks.onVisibilityChange();
        else if (onChange) onChange();
        populateDropdown(key);
        refreshChipBadges();
      };
      head.appendChild(bShow);
    }
    dd.appendChild(head);

    // Search box (pointless for single-value lists such as Total)
    let search = null;
    if (allValues.length > 1) {
      search = document.createElement('input');
      search.type = 'text';
      search.className = 'gig-dd-search';
      search.placeholder = 'Search';
      dd.appendChild(search);
    }

    if (levelDisabled) {
      const note = document.createElement('div');
      note.className = 'gig-dd-note';
      note.textContent = 'Level is collapsed - click the chip to enable it.';
      dd.appendChild(note);
    }

    // "(Select All)" row - tri-state, applies to the filtered values
    let cbAll = null;
    if (canCheck && !levelDisabled && allValues.length > 1) {
      const rowAll = document.createElement('div');
      rowAll.className = 'gig-dd-row gig-dd-selectall';
      const labelAll = document.createElement('label');
      labelAll.className = 'gig-dd-label';
      cbAll = document.createElement('input');
      cbAll.type = 'checkbox';
      cbAll.style.setProperty('--gig-accent', accent);
      labelAll.appendChild(cbAll);
      labelAll.appendChild(document.createTextNode('(Select All)'));
      rowAll.appendChild(labelAll);
      dd.appendChild(rowAll);
    }

    const list = document.createElement('div');
    list.className = 'gig-dd-list';
    dd.appendChild(list);

    const filteredValues = () =>
      allValues.filter(v => !filter || v.toLowerCase().includes(filter));
    // Values that can actually be (un)checked right now
    const checkableValues = () =>
      filteredValues().filter(v => !state.isHidden(key, v));

    function syncSelectAll() {
      if (!cbAll) return;
      const vs = checkableValues();
      if (vs.length === 0) { cbAll.checked = false; cbAll.indeterminate = false; return; }
      const n = vs.reduce((acc, v) => acc + (hooks.isChecked(key, v) ? 1 : 0), 0);
      cbAll.checked = (n === vs.length);
      cbAll.indeterminate = (n > 0 && n < vs.length);
    }

    function renderList() {
      list.innerHTML = '';
      filteredValues().forEach(v => {
        const row = document.createElement('div');
        row.className = 'gig-dd-row';
        const hidden = state.isHidden(key, v);
        if (hidden) row.classList.add('is-hidden');

        // Checkbox: highlight (select) this series in the plots
        const label = document.createElement('label');
        label.className = 'gig-dd-label';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.style.setProperty('--gig-accent', accent);
        cb.disabled = !canCheck || levelDisabled || hidden;
        if (canCheck && !levelDisabled && !hidden) cb.checked = !!hooks.isChecked(key, v);
        cb.addEventListener('change', () => {
          hooks.onCheck(key, v, cb.checked);
          syncSelectAll();          // cheap: no list rebuild, no extra redraws
        });
        label.appendChild(cb);
        label.appendChild(document.createTextNode(v));
        row.appendChild(label);

        // Eye: hide / unhide this series (and its whole subtree)
        const eye = document.createElement('button');
        eye.className = 'gig-dd-eye';
        eye.title = hidden ? 'Show in plot' : 'Hide from plot';
        eye.innerHTML = hidden ? ICON_EYE_OFF : ICON_EYE;
        eye.onclick = () => {
          state.toggleHidden(key, v);
          if (hooks.onVisibilityChange) hooks.onVisibilityChange();
          else if (onChange) onChange();
          renderList();
          syncSelectAll();
          refreshChipBadges();
          // Keep the "Show all" button in the header in sync
          const hasShow = head.querySelector('.gig-dd-showall');
          const needShow = state.hiddenCountFor(key) > 0;
          if (needShow && !hasShow) populateDropdown(key);
          else if (!needShow && hasShow) hasShow.remove();
        };
        row.appendChild(eye);

        list.appendChild(row);
      });
      syncSelectAll();
    }

    if (cbAll) {
      cbAll.addEventListener('change', () => {
        const vs = checkableValues();
        const checked = cbAll.checked;
        // ONE batched selection change + ONE redraw (no per-value redraws)
        if (hooks.onCheckMany) hooks.onCheckMany(key, vs, checked);
        else vs.forEach(v => hooks.onCheck(key, v, checked));
        renderList();
      });
    }

    if (search) {
      search.addEventListener('input', () => {
        filter = search.value.trim().toLowerCase();
        renderList();
      });
    }

    renderList();
  }

  function openDropdown(chipEl, key) {
    clearTimeout(hideTimer);
    populateDropdown(key);
    dd.style.top = chipEl.offsetTop + 'px';
    dd.style.left = (chipEl.offsetLeft + chipEl.offsetWidth + 10) + 'px';
    dd.classList.add('visible');
    // If the right-opening dropdown is clipped by the viewport (panel
    // docked at the right edge), flip it to the chip's left instead.
    requestAnimationFrame(() => {
      const r = dd.getBoundingClientRect();
      if (r.right > window.innerWidth - 8) {
        dd.style.left = (chipEl.offsetLeft - dd.offsetWidth - 10) + 'px';
      }
    });
  }

  // ---- Total chip (root series) -----------------------------------------
  // Click toggles the Total highlight; hover opens a dropdown with the
  // same checkbox + eye (hide) controls as the other levels.
  const totalChip = document.createElement('div');
  totalChip.className = 'gig-hier-chip gig-total-chip';
  totalChip.dataset.key = TOTAL_KEY;
  totalChip.style.marginLeft = BASE_INDENT + 'px';
  totalChip.innerHTML = '<span class="gig-chip-color" style="background:' +
    getDepthColor(0) + '"></span>Total';
  totalChip.addEventListener('mouseenter', () => openDropdown(totalChip, TOTAL_KEY));
  totalChip.addEventListener('mouseleave', () => {
    hideTimer = setTimeout(() => dd.classList.remove('visible'), 250);
  });
  totalChip.addEventListener('click', () => {
    if (hooks.isChecked && hooks.onCheck) {
      hooks.onCheck(TOTAL_KEY, 'Total', !hooks.isChecked(TOTAL_KEY, 'Total'));
    }
  });
  container.appendChild(totalChip);

  // ---- chips ------------------------------------------------------------
  state.activeKeys.forEach((key, index) => {
    const el = document.createElement('div');
    el.className = 'gig-hier-chip';
    el.draggable = true;
    el.dataset.key = key;
    el.style.marginLeft = BASE_INDENT + 'px';
    if (state.disabled.has(key)) el.classList.add('disabled');
    el.innerHTML = '<span class="gig-chip-color" style="background:' +
      getDepthColor(index + 1) + '"></span>' + key;

    let wasDragged = false;

    el.addEventListener('mouseenter', () => openDropdown(el, key));
    el.addEventListener('mouseleave', () => {
      hideTimer = setTimeout(() => dd.classList.remove('visible'), 250);
    });

    el.addEventListener('dragstart', e => {
      dd.classList.remove('visible');
      e.dataTransfer.setData('text/plain', key);
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      container.querySelectorAll('.gig-hier-chip')
        .forEach(c => c.classList.remove('drag-over-top', 'drag-over-bottom'));
      wasDragged = true;
      setTimeout(() => wasDragged = false, 100);
    });
    el.addEventListener('dragover', e => {
      e.preventDefault();
      const b = el.getBoundingClientRect();
      const offset = e.clientY - b.top;
      container.querySelectorAll('.gig-hier-chip')
        .forEach(c => c.classList.remove('drag-over-top', 'drag-over-bottom'));
      el.classList.add(offset > b.height / 2 ? 'drag-over-bottom' : 'drag-over-top');
    });
    el.addEventListener('drop', e => {
      e.preventDefault();
      container.querySelectorAll('.gig-hier-chip')
        .forEach(c => c.classList.remove('drag-over-top', 'drag-over-bottom'));
      const draggedKey = e.dataTransfer.getData('text/plain');
      if (draggedKey === key) return;

      let currentKeys = Array.from(container.querySelectorAll('.gig-hier-chip'))
        .map(c => c.dataset.key)
        .filter(k => k !== TOTAL_KEY);
      const draggedIdx = currentKeys.indexOf(draggedKey);
      currentKeys.splice(draggedIdx, 1);
      let targetIdx = currentKeys.indexOf(key);
      const b = el.getBoundingClientRect();
      const offset = e.clientY - b.top;
      if (offset > b.height / 2) currentKeys.splice(targetIdx + 1, 0, draggedKey);
      else currentKeys.splice(targetIdx, 0, draggedKey);

      if (state.isValidOrder(currentKeys)) {
        state.activeKeys = currentKeys;
        state.rebuild();
        renderLegend(container, state, onChange, hooks);
        if (onChange) onChange();
      } else {
        const draggedEl = container.querySelector('.dragging') || el;
        draggedEl.classList.add('error-shake');
        setTimeout(() => draggedEl.classList.remove('error-shake'), 400);
        renderLegend(container, state, onChange, hooks);
      }
    });

    // Click toggles a level on/off (collapses that level of the hierarchy)
    el.addEventListener('click', () => {
      if (wasDragged) return;
      if (state.disabled.has(key)) state.disabled.delete(key);
      else state.disabled.add(key);
      state.rebuild();
      renderLegend(container, state, onChange, hooks);
      if (onChange) onChange();
    });

    container.appendChild(el);
  });

  // ---- connector lines for "/" nesting constraints ----------------------
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.style.position = 'absolute';
  svg.style.top = '0';
  svg.style.left = '0';
  svg.style.width = '100%';
  svg.style.height = Math.max(container.scrollHeight, container.offsetHeight) + 'px';
  svg.style.pointerEvents = 'none';
  svg.style.zIndex = '1';

  const chips = Array.from(container.querySelectorAll('.gig-hier-chip'));
  state.constraints.forEach(rule => {
    const parentEl = chips.find(c => c.dataset.key === rule.parent);
    const childEl = chips.find(c => c.dataset.key === rule.child);
    if (!parentEl || !childEl) return;

    const y1 = parentEl.offsetTop + parentEl.offsetHeight / 2;
    const y2 = childEl.offsetTop + childEl.offsetHeight / 2;
    const x1 = parentEl.offsetLeft;
    const x2 = childEl.offsetLeft;
    const trackX = Math.max(2, Math.min(x1, x2) - 14);
    const r = 6;

    let d = '';
    if (y1 < y2) {
      d = 'M ' + x1 + ' ' + y1 + ' L ' + (trackX + r) + ' ' + y1 +
          ' Q ' + trackX + ' ' + y1 + ' ' + trackX + ' ' + (y1 + r) +
          ' L ' + trackX + ' ' + (y2 - r) +
          ' Q ' + trackX + ' ' + y2 + ' ' + (trackX + r) + ' ' + y2 +
          ' L ' + x2 + ' ' + y2;
    } else if (y1 > y2) {
      d = 'M ' + x1 + ' ' + y1 + ' L ' + (trackX + r) + ' ' + y1 +
          ' Q ' + trackX + ' ' + y1 + ' ' + trackX + ' ' + (y1 - r) +
          ' L ' + trackX + ' ' + (y2 + r) +
          ' Q ' + trackX + ' ' + y2 + ' ' + (trackX + r) + ' ' + y2 +
          ' L ' + x2 + ' ' + y2;
    }
    if (d) {
      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', '#9ca3af');
      path.setAttribute('stroke-width', '2');
      svg.appendChild(path);
    }
  });

  container.appendChild(svg);
  container.appendChild(dd);
  refreshChipBadges();
}

// ---------------------------------------------------------------------------
// Floating hierarchy panel (ported from the plotly add_hierarchy adapter):
//  - clean card, draggable by grabbing anywhere on its background
//  - resizable via 8 edge/corner handles; the chip content SCALES with the
//    panel (transform), so a bigger panel shows bigger chips
//  - edge docking: drop the panel near an edge of the plot and it snaps
//    outside the plotting area; the host is told (via opts.onLayout) to
//    reserve that band so the plots resize around it. Dragging it away
//    releases the band again.
//
// initHierPanel(panelEl, hostEl, {
//   onLayout(side|null, band)  -> reserve/release space in the plot layout
//   insets: {left,right,top,bottom} -> host chrome (e.g. a toolbar) the
//                                      panel should not cover when docked
//   initialDock: 'right'|null
// }) -> { refreshNatural(), setDock(side) }
// ---------------------------------------------------------------------------
export function initHierPanel(panelEl, hostEl, opts) {
  if (!panelEl || !hostEl) return null;
  opts = opts || {};
  const onLayout = opts.onLayout || (() => {});
  // Used live (not copied): the host may mutate it (e.g. toolbar docking)
  const insets = opts.insets || { left: 8, right: 8, top: 8, bottom: 8 };
  const inner = panelEl.querySelector('.gig-hier-panel-inner');
  const PAD = 8, DOCK_TH = 30, MIN_W = 90, MIN_H = 60;
  const CONTENT_PAD = 14;   // panel padding around the scaled content

  let docked = null;
  let naturalW = 160, naturalH = 100;

  // ---- content scaling -------------------------------------------------
  function measureNatural() {
    if (!inner) return;
    inner.style.transform = 'none';
    inner.style.width = 'auto';
    naturalW = Math.max(80, inner.scrollWidth);
    naturalH = Math.max(40, inner.scrollHeight);
    inner.style.width = naturalW + 'px';
    applyScale();
  }
  function applyScale() {
    if (!inner) return;
    const pw = panelEl.clientWidth - CONTENT_PAD;
    const ph = panelEl.clientHeight - CONTENT_PAD;
    let sc = Math.min(pw / naturalW, ph / naturalH);
    sc = Math.max(0.5, Math.min(sc, 3));
    // Centre the scaled content inside the panel: when the panel is
    // stretched wider/taller than the chips need, the leftover space is
    // split evenly instead of the chips hugging the top-left corner.
    const tx = Math.max(0, (pw - naturalW * sc) / 2);
    const ty = Math.max(0, (ph - naturalH * sc) / 2);
    inner.style.transform = 'translate(' + tx + 'px, ' + ty + 'px) scale(' + sc + ')';
  }

  // ---- docking ---------------------------------------------------------
  function band(side) {
    return (side === 'left' || side === 'right')
      ? panelEl.offsetWidth + PAD * 2
      : panelEl.offsetHeight + PAD * 2;
  }
  function clampTopLeft(l, t) {
    l = Math.max(insets.left, Math.min(l, hostEl.clientWidth - insets.right - panelEl.offsetWidth));
    t = Math.max(insets.top, Math.min(t, hostEl.clientHeight - insets.bottom - panelEl.offsetHeight));
    return [l, t];
  }
  function snapToDock() {
    if (!docked) return;
    let l = panelEl.offsetLeft, t = panelEl.offsetTop;
    if (docked === 'right') l = hostEl.clientWidth - insets.right - panelEl.offsetWidth;
    if (docked === 'left') l = insets.left;
    if (docked === 'top') t = insets.top;
    if (docked === 'bottom') t = hostEl.clientHeight - insets.bottom - panelEl.offsetHeight;
    const p = clampTopLeft(l, t);
    panelEl.style.left = p[0] + 'px';
    panelEl.style.top = p[1] + 'px';
  }
  function setDock(side) {
    docked = side;
    panelEl.classList.toggle('docked', !!side);
    if (side) snapToDock();
    onLayout(side, side ? band(side) : 0);
  }
  function detectDock() {
    const l = panelEl.offsetLeft, t = panelEl.offsetTop;
    const w = panelEl.offsetWidth, h = panelEl.offsetHeight;
    const dl = l - insets.left;
    const dr = (hostEl.clientWidth - insets.right) - (l + w);
    const dt = t - insets.top;
    const db = (hostEl.clientHeight - insets.bottom) - (t + h);
    const best = Math.min(dl, dr, dt, db);
    if (best > DOCK_TH) return null;
    if (best === dr) return 'right';
    if (best === dl) return 'left';
    if (best === dt) return 'top';
    return 'bottom';
  }

  // ---- drag anywhere on the panel background ---------------------------
  let dragging = false, moved = false, sx, sy, sl, st;
  panelEl.addEventListener('mousedown', e => {
    if (e.target.closest('.gig-hier-chip, .gig-hier-dropdown, .gig-resize-handle, input, button, a, label')) return;
    dragging = true; moved = false;
    sx = e.clientX; sy = e.clientY;
    sl = panelEl.offsetLeft; st = panelEl.offsetTop;
    e.preventDefault();
  });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (!moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
    if (!moved && docked) {
      // Undock as soon as a real drag starts so the plots expand back.
      docked = null;
      panelEl.classList.remove('docked');
      onLayout(null, 0);
    }
    moved = true;
    const p = clampTopLeft(sl + dx, st + dy);
    panelEl.style.left = p[0] + 'px';
    panelEl.style.top = p[1] + 'px';
  });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    if (moved) setDock(detectDock());
  });

  // ---- resize handles (content rescales live) --------------------------
  panelEl.querySelectorAll('.gig-resize-handle').forEach(h => {
    h.addEventListener('mousedown', e => {
      e.stopPropagation();
      e.preventDefault();
      const cls = h.className;
      let resizing = true;
      const rsx = e.clientX, rsy = e.clientY;
      const sw = panelEl.offsetWidth, sh = panelEl.offsetHeight;
      const rl = panelEl.offsetLeft, rt = panelEl.offsetTop;
      const onMove = em => {
        if (!resizing) return;
        const dx = em.clientX - rsx, dy = em.clientY - rsy;
        let nw = sw, nh = sh, nl = rl, nt = rt;
        if (/\be\b|ne|se/.test(cls)) nw = sw + dx;
        if (/\bs\b|sw|se/.test(cls)) nh = sh + dy;
        if (/\bw\b|nw|sw/.test(cls)) { nw = sw - dx; nl = rl + dx; }
        if (/\bn\b|nw|ne/.test(cls)) { nh = sh - dy; nt = rt + dy; }
        if (nw >= MIN_W) { panelEl.style.width = nw + 'px'; panelEl.style.left = nl + 'px'; }
        if (nh >= MIN_H) { panelEl.style.height = nh + 'px'; panelEl.style.top = nt + 'px'; }
        applyScale();
      };
      const onUp = () => {
        resizing = false;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        if (docked) { snapToDock(); onLayout(docked, band(docked)); }
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  });

  // Keep the dock flush when the widget itself is resized.
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => { if (docked) { snapToDock(); onLayout(docked, band(docked)); } })
      .observe(hostEl);
  }

  // ---- initial sizing + dock ------------------------------------------
  requestAnimationFrame(() => {
    measureNatural();
    panelEl.style.width = (naturalW + CONTENT_PAD) + 'px';
    panelEl.style.height = (naturalH + CONTENT_PAD) + 'px';
    applyScale();
    setDock(opts.initialDock !== undefined ? opts.initialDock : 'right');
  });

  return {
    refreshNatural: () => { measureNatural(); if (docked) snapToDock(); },
    setDock
  };
}
