import {
  applyBrushSelection,
  attachBrushGesture,
  createBrushOverlay,
  createGigHierarchyAdapter,
  pointInBox,
  pointInPolygon,
  updateGigSelection
} from '../modules/gig/gig-selection.js';
import {
  createHierState,
  resolveGigStructure
} from '../modules/gig/gig-state.js';
import { gigToolbarMarkup, initGigToolbarControls } from '../modules/gig/gig-toolbar.js';
import {
  calculateSquarePlotGrid,
  initGigChrome
} from '../modules/gig/gig-layout.js';
import { createHierarchyWidget } from '../modules/core/hierarchy-widget.js';
import { dataFrameToRows as safeConvert } from '../modules/core/hierarchy-model.js';

// Plot-specific CSS remains in gig_point.yaml; the shared hierarchy widget
// stylesheet is attached by create_gig_widget().

const TEMPLATE = `
<div class="gig-widget gig-point">
  ${gigToolbarMarkup()}
  <div class="gig-point-main">
    <div class="gig-scatter-grid">
      <div class="gig-y-axis-area"><select class="gig-axis-select" data-role="featY"></select></div>
      <div class="gig-chart-wrap"><canvas></canvas></div>
      <div class="gig-x-axis-area"><select class="gig-axis-select" data-role="featX"></select></div>
    </div>
  </div>
  <div class="gig-tooltip"></div>
</div>
`;

HTMLWidgets.widget({
  name: 'gig_point',
  type: 'output',

  factory: function (el, width, height) {
    let scatterChart = null;
    let state = null;
    const selectedIndices = new Set();
    let totalDimmed = false;
    let root = null;
    let hierarchyWidget = null;
    let chrome = null;
    let renderController = null;

    let features = [];
    let currentFeats = { X: null, Y: null };
    // Chart point index -> state.series index (hidden series are skipped)
    let pointIndexMap = [];
    let hasUserZoomed = false;

    // Toolbar state
    let selectionMode = 'single';
    let isBoxSelectOn = false, isLassoSelectOn = false;

    function q(sel) { return root.querySelector(sel); }
    function qa(sel) { return Array.from(root.querySelectorAll(sel)); }
    function canvasEl() { return q('.gig-chart-wrap canvas'); }

    function resizeSquarePlot() {
      const main = q('.gig-point-main');
      const grid = q('.gig-scatter-grid');
      if (!main || !grid) return;
      const style = window.getComputedStyle(main);
      const pixels = property => Number.parseFloat(style[property]) || 0;
      const availableWidth = main.clientWidth -
        pixels('paddingLeft') - pixels('paddingRight');
      const availableHeight = main.clientHeight -
        pixels('paddingTop') - pixels('paddingBottom');
      const size = calculateSquarePlotGrid(availableWidth, availableHeight);
      if (size.side < 1) return;
      grid.style.width = `${size.width}px`;
      grid.style.height = `${size.height}px`;
      scatterChart?.resize();
    }

    // ---- crispness on browser zoom (devicePixelRatio changes) ----
    let lastDpr = window.devicePixelRatio;
    let dprTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(dprTimer);
      dprTimer = setTimeout(() => {
        if (window.devicePixelRatio !== lastDpr) {
          lastDpr = window.devicePixelRatio;
          if (scatterChart) scatterChart.resize();
        }
      }, 100);
    });

    // ------------------------------------------------------------------
    // Selection modes (single / multiple / inverse x2 / hierarchy)
    // ------------------------------------------------------------------
    function processSelection(index, shift) {
      updateGigSelection({
        state,
        selectedIndices,
        index,
        shift,
        mode: selectionMode
      });
      applySelectionVisually();
    }

    function handleInteraction(activeEls, shift, moved) {
      if (isBoxSelectOn || isLassoSelectOn || moved) return;
      if (!activeEls.length) {
        if (!shift && selectionMode === 'single') {
          selectedIndices.clear();
          applySelectionVisually();
        }
        return;
      }
      const idx = pointIndexMap[activeEls[0].index];
      if (idx === undefined) return;
      processSelection(idx, shift);
    }

    // ------------------------------------------------------------------
    // Tooltip
    // ------------------------------------------------------------------
    function externalTooltipHandler(context) {
      const { chart, tooltip } = context;
      const tooltipEl = q('.gig-tooltip');
      if (tooltip.opacity === 0) { tooltipEl.style.opacity = 0; return; }
      if (tooltip.dataPoints && tooltip.dataPoints.length) {
        const dp = tooltip.dataPoints[0];
        const idx = pointIndexMap[dp.dataIndex];
        const d = state.series[idx];
        if (d) {
          const dk = state.displayKeys();
          let locText = state.label(d);
          if (d._depth > 1) {
            locText += ' <span style="opacity:.7;font-size:10px;">(' +
              d[dk[d._depth - 2]] + ')</span>';
          }
          const fv = v => typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(4)) : v;
          const color = Array.isArray(chart.data.datasets[0].backgroundColor)
            ? chart.data.datasets[0].backgroundColor[dp.dataIndex]
            : chart.data.datasets[0].backgroundColor;
          tooltipEl.innerHTML =
            '<div style="font-weight:bold;margin-bottom:6px;border-bottom:1px solid rgba(255,255,255,.2);padding-bottom:4px;display:flex;align-items:center;">' +
            '<span class="gig-tooltip-swatch" style="background-color:' + color + '"></span>' +
            locText + '</div>' +
            '<div>' + currentFeats.X + ': ' + fv(dp.parsed.x) + '</div>' +
            '<div style="margin-top:3px;">' + currentFeats.Y + ': ' + fv(dp.parsed.y) + '</div>';
        }
      }
      const position = chart.canvas.getBoundingClientRect();
      tooltipEl.style.opacity = 1;
      tooltipEl.style.left = (position.left + tooltip.caretX) + 'px';
      tooltipEl.style.top = (position.top + tooltip.caretY) + 'px';
    }

    // ------------------------------------------------------------------
    // Point styling
    // ------------------------------------------------------------------
    function pointStyle(d, i) {
      const hasSelection = selectedIndices.size > 0;
      const isSel = selectedIndices.has(i);
      const isTop = d._depth === 0;
      if (hasSelection) {
        if (isSel) return { c: state.depthColor(d._depth), r: isTop ? 6 : 4 };
        return { c: '#e2e8f0', r: 2 };
      }
      if (isTop && !totalDimmed) return { c: state.depthColor(d._depth), r: 6 };
      return { c: '#e2e8f0', r: 2 };
    }

    // ------------------------------------------------------------------
    // Chart + zoom/pan (ported from linkvis initScatterZoomPan)
    // ------------------------------------------------------------------
    let clickMoved = false;   // suppress point-select after a pan drag

    function initChart() {
      scatterChart = new Chart(canvasEl(), {
        type: 'scatter',
        data: { datasets: [{ data: [], backgroundColor: [], pointRadius: [], pointHitRadius: 6 }] },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          scales: {
            x: { type: 'linear', ticks: { font: { weight: 'bold' } },
                 grid: { color: 'rgba(0,0,0,0.05)' }, border: { display: false } },
            y: { type: 'linear', ticks: { font: { weight: 'bold' } },
                 grid: { color: 'rgba(0,0,0,0.05)' }, border: { display: false } }
          },
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false, external: externalTooltipHandler, mode: 'nearest', intersect: true }
          },
          onClick: (e, activeEls) =>
            handleInteraction(activeEls, e.native ? e.native.shiftKey : false, clickMoved)
        }
      });

      const canv = canvasEl();
      let isPanning = false, startX, startY;

      canv.addEventListener('wheel', e => {
        if (isBoxSelectOn || isLassoSelectOn) return;
        e.preventDefault();
        hasUserZoomed = true;
        const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
        const xAxis = scatterChart.scales.x, yAxis = scatterChart.scales.y;
        if (!xAxis || !yAxis) return;
        const xData = xAxis.getValueForPixel(e.offsetX);
        const yData = yAxis.getValueForPixel(e.offsetY);
        const xRange = xAxis.max - xAxis.min, yRange = yAxis.max - yAxis.min;
        const xProp = (xData - xAxis.min) / xRange, yProp = (yData - yAxis.min) / yRange;
        scatterChart.options.scales.x.min = xData - (xRange * zoomFactor * xProp);
        scatterChart.options.scales.x.max = xData + (xRange * zoomFactor * (1 - xProp));
        scatterChart.options.scales.y.min = yData - (yRange * zoomFactor * yProp);
        scatterChart.options.scales.y.max = yData + (yRange * zoomFactor * (1 - yProp));
        scatterChart.update('none');
      }, { passive: false });

      canv.addEventListener('mousedown', e => {
        if (isBoxSelectOn || isLassoSelectOn) return;
        isPanning = true;
        clickMoved = false;
        startX = e.offsetX;
        startY = e.offsetY;
      });
      window.addEventListener('mousemove', e => {
        if (!isPanning) return;
        const r = canv.getBoundingClientRect();
        const currX = e.clientX - r.left, currY = e.clientY - r.top;
        if (Math.abs(currX - startX) < 2 && Math.abs(currY - startY) < 2) return;
        clickMoved = true;
        hasUserZoomed = true;
        const xAxis = scatterChart.scales.x, yAxis = scatterChart.scales.y;
        if (!xAxis || !yAxis) return;
        const dxData = (xAxis.max - xAxis.min) / xAxis.width * (currX - startX);
        const dyData = (yAxis.max - yAxis.min) / yAxis.height * (currY - startY);
        scatterChart.options.scales.x.min = xAxis.min - dxData;
        scatterChart.options.scales.x.max = xAxis.max - dxData;
        scatterChart.options.scales.y.min = yAxis.min + dyData;
        scatterChart.options.scales.y.max = yAxis.max + dyData;
        startX = currX;
        startY = currY;
        scatterChart.update('none');
      });
      window.addEventListener('mouseup', () => { isPanning = false; });
      canv.addEventListener('mouseleave', () => { isPanning = false; });
    }

    // ------------------------------------------------------------------
    // Box / lasso brushing (single-dataset variant from linkvis)
    // ------------------------------------------------------------------
    function initBrushing() {
      const canv = canvasEl();
      const wrapper = canv.parentElement;
      const brushSvg = createBrushOverlay(wrapper);

      attachBrushGesture({
        surface: canv,
        overlay: brushSvg,
        signal: renderController?.signal,
        getPoint: event => {
          const rect = canv.getBoundingClientRect();
          return { x: event.clientX - rect.left, y: event.clientY - rect.top };
        },
        getMode: () => isBoxSelectOn ? 'box' : (isLassoSelectOn ? 'lasso' : null),
        onComplete: ({ event, mode, path, box }) => {
          if (!event.shiftKey) selectedIndices.clear();
        const hits = [];
        const meta = scatterChart.getDatasetMeta(0);
        for (let i = 0; i < meta.data.length; i++) {
          const pt = meta.data[i];
          if (pt.x === undefined || pt.y === undefined || isNaN(pt.x) || isNaN(pt.y)) continue;
          let hit = false;
          if (mode === 'box' && pointInBox({ x: pt.x, y: pt.y }, box)) hit = true;
          else if (mode === 'lasso' && pointInPolygon({ x: pt.x, y: pt.y }, path)) hit = true;
          if (hit && pointIndexMap[i] !== undefined) hits.push(pointIndexMap[i]);
        }

        applyBrushSelection({
          hits,
          state,
          selectedIndices,
          mode: selectionMode
        });
        applySelectionVisually();
        }
      });
    }

    // ------------------------------------------------------------------
    // Toolbar
    // ------------------------------------------------------------------
    function updateCursors() {
      canvasEl().style.cursor = (isBoxSelectOn || isLassoSelectOn) ? 'crosshair' : 'default';
    }

    function initToolbar() {
      const controls = initGigToolbarControls({
        root,
        signal: renderController?.signal,
        onSelectionModeChange: mode => { selectionMode = mode; },
        onBrushModeChange: brush => {
          isBoxSelectOn = brush.box;
          isLassoSelectOn = brush.lasso;
          updateCursors();
        }
      });

      q('[data-role="reset"]').addEventListener('click', () => {
        selectedIndices.clear();
        totalDimmed = false;
        state.hiddenValues.clear();
        state.disabled.clear();
        controls.reset();
        hasUserZoomed = false;
        delete scatterChart.options.scales.x.min;
        delete scatterChart.options.scales.x.max;
        delete scatterChart.options.scales.y.min;
        delete scatterChart.options.scales.y.max;
        state.rebuild();
        hierarchyWidget?.sync();
        updatePlatform();
      });
    }

    // ------------------------------------------------------------------
    // Redraw
    // ------------------------------------------------------------------
    function updatePlatform() {
      const pts = [], cols = [], rads = [];
      pointIndexMap = [];
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

      state.series.forEach((d, i) => {
        if (state.isSeriesHidden(d)) return;
        const px = +d[currentFeats.X], py = +d[currentFeats.Y];
        if (isNaN(px) || isNaN(py)) return;
        if (px < minX) minX = px; if (px > maxX) maxX = px;
        if (py < minY) minY = py; if (py > maxY) maxY = py;
        const st = pointStyle(d, i);
        pts.push({ x: px, y: py });
        cols.push(st.c);
        rads.push(st.r);
        pointIndexMap.push(i);
      });

      // Auto-fit with 5% padding unless the user has zoomed/panned
      if (!hasUserZoomed && minX !== Infinity) {
        let xPad = (maxX - minX) * 0.05; if (xPad === 0) xPad = 1;
        let yPad = (maxY - minY) * 0.05; if (yPad === 0) yPad = 1;
        scatterChart.options.scales.x.min = minX - xPad;
        scatterChart.options.scales.x.max = maxX + xPad;
        scatterChart.options.scales.y.min = minY - yPad;
        scatterChart.options.scales.y.max = maxY + yPad;
      }

      Object.assign(scatterChart.data.datasets[0], {
        data: pts, backgroundColor: cols, pointRadius: rads
      });
      scatterChart.update('none');
    }

    function applySelectionVisually() {
      const cols = [], rads = [];
      pointIndexMap.forEach(i => {
        const st = pointStyle(state.series[i], i);
        cols.push(st.c);
        rads.push(st.r);
      });
      scatterChart.data.datasets[0].backgroundColor = cols;
      scatterChart.data.datasets[0].pointRadius = rads;
      scatterChart.update('none');
    }

    return {
      renderValue: function (x) {
        renderController?.abort();
        renderController = new AbortController();
        el.innerHTML = TEMPLATE;
        root = el;

        const rows = safeConvert(x.data);
        state = createHierState(rows, resolveGigStructure(x));

        // Numeric feature columns feed the axis dropdowns
        const sample = rows[0] || {};
        features = Object.keys(sample).filter(k => typeof sample[k] === 'number');
        currentFeats.X = (x.xvar && features.includes(x.xvar)) ? x.xvar : features[0];
        currentFeats.Y = (x.yvar && features.includes(x.yvar)) ? x.yvar : (features[1] || features[0]);

        ['featX', 'featY'].forEach(role => {
          const sel = q('[data-role="' + role + '"]');
          features.forEach(f => {
            const op = document.createElement('option');
            op.value = f; op.text = f;
            if ((role === 'featX' && f === currentFeats.X) ||
                (role === 'featY' && f === currentFeats.Y)) op.selected = true;
            sel.appendChild(op);
          });
          sel.addEventListener('change', e => {
            if (role === 'featX') currentFeats.X = e.target.value;
            else currentFeats.Y = e.target.value;
            hasUserZoomed = false;    // new variables -> re-fit the axes
            updatePlatform();
          });
        });

        initChart();
        initBrushing();
        initToolbar();
        updateCursors();

        const hierarchyAdapter = createGigHierarchyAdapter({
          state,
          selectedIndices,
          getTotalDimmed: () => totalDimmed,
          setTotalDimmed: value => { totalDimmed = value; },
          onSelectionChange: applySelectionVisually,
          onStructureChange: updatePlatform,
          onVisibilityChange: () => {
            updatePlatform();
          }
        });

        hierarchyWidget = createHierarchyWidget({
          host: root,
          structure: resolveGigStructure(x),
          signal: renderController.signal,
          model: hierarchyAdapter.model,
          valueControls: hierarchyAdapter.valueControls,
          onWidgetDragEnd: () => chrome?.handleHierarchyDragEnd()
        });
        chrome = initGigChrome({
          root,
          main: q('.gig-point-main'),
          hierarchyWidget,
          signal: renderController.signal,
          onResize: resizeSquarePlot
        });

        resizeSquarePlot();
        updatePlatform();
      },

      resize: function () {
        resizeSquarePlot();
      }
    };
  }
});
