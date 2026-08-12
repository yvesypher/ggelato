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
  compareTimeRows,
  createHierState,
  resolveGigStructure,
  resolveGigValue,
  resolveTimeColumn
} from '../modules/gig/gig-state.js';
import { gigToolbarMarkup, initGigToolbarControls } from '../modules/gig/gig-toolbar.js';
import { initGigChrome } from '../modules/gig/gig-layout.js';
import { createHierarchyWidget } from '../modules/core/hierarchy-widget.js';
import { dataFrameToRows as safeConvert } from '../modules/core/hierarchy-model.js';

// Plot-specific CSS remains in gig_stldp.yaml; the shared hierarchy widget
// stylesheet is attached by create_gig_widget().

const TEMPLATE = `
<div class="gig-widget gig-stldp">
  ${gigToolbarMarkup({ includeScale: true })}
  <div class="gig-stldp-main">
    <div class="gig-stl-controls">
      <button class="gig-stl-chip active" data-comp="Data">Data</button>
      <button class="gig-stl-chip active" data-comp="Trend">Trend</button>
      <button class="gig-stl-chip active" data-comp="Season">Seasonality</button>
      <button class="gig-stl-chip active" data-comp="Remainder">Remainder</button>
    </div>
    <div class="gig-stl-wrapper" data-wrap="Data"><canvas></canvas></div>
    <div class="gig-stl-wrapper" data-wrap="Trend"><canvas></canvas></div>
    <div class="gig-stl-wrapper" data-wrap="Season"><canvas></canvas></div>
    <div class="gig-stl-wrapper" data-wrap="Remainder"><canvas></canvas></div>
    <div class="gig-stl-crosshair"></div>
  </div>
  <div class="gig-tooltip"></div>
</div>
`;

HTMLWidgets.widget({
  name: 'gig_stldp',
  type: 'output',

  factory: function (el, width, height) {
    let stlCharts = {};              // { data, trend, season, remainder }
    let state = null;                // hierarchy state
    let stlDictScaled = {};          // canonicalId -> sorted rows (scaled)
    let stlDictUnscaled = {};        // canonicalId -> sorted rows (original)
    let hasScaled = false;
    let isScaled = false;            // which dictionary feeds the charts
    const selectedIndices = new Set();
    // In the default (no selection) state the Total line is drawn coloured,
    // so its checkbox reads as checked; unchecking it dims Total to grey.
    let totalDimmed = false;
    let valueVar = 'value', seasonVar = 'season_year', timeVar = 'Time';
    let root = null;
    let hierarchyWidget = null;
    let chrome = null;
    let renderController = null;

    // Toolbar state
    let selectionMode = 'single';
    let isBoxSelectOn = false, isLassoSelectOn = false;

    const CHART_ORDER = ['Data', 'Trend', 'Season', 'Remainder'];
    const CHART_MAP = { Data: 'data', Trend: 'trend', Season: 'season', Remainder: 'remainder' };
    const Y_AXIS_WIDTH = 78;         // shared y-axis width => panels align vertically

    function q(sel) { return root.querySelector(sel); }
    function qa(sel) { return Array.from(root.querySelectorAll(sel)); }

    function showRenderError(error) {
      console.error('gig_stldp render failed:', error);
      const target = root?.querySelector('.gig-stldp-main') || el;
      target.replaceChildren();
      const notice = document.createElement('div');
      notice.className = 'gig-render-error';
      Object.assign(notice.style, {
        margin: 'auto',
        maxWidth: '680px',
        padding: '16px 20px',
        border: '1px solid #fecaca',
        borderRadius: '8px',
        background: '#fff7f7',
        color: '#991b1b',
        fontFamily: 'sans-serif',
        fontSize: '13px',
        lineHeight: '1.45'
      });
      notice.textContent = `gig_stldp could not render: ${error?.message || error}`;
      target.appendChild(notice);
    }

    // ------------------------------------------------------------------
    // Crispness on browser zoom (devicePixelRatio changes)
    // ------------------------------------------------------------------
    let lastDpr = window.devicePixelRatio;
    let dprTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(dprTimer);
      dprTimer = setTimeout(() => {
        if (window.devicePixelRatio !== lastDpr) {
          lastDpr = window.devicePixelRatio;
          Object.values(stlCharts).forEach(c => { if (c) c.resize(); });
        }
      }, 100);
    });

    function buildStlDictionary(rows, out) {
      Object.keys(out).forEach(k => delete out[k]);
      rows.forEach(r => {
        const id = state.canonicalId(r);
        if (!out[id]) out[id] = [];
        out[id].push(r);
      });
      Object.values(out).forEach(rowsForSeries =>
        rowsForSeries.sort((a, b) => compareTimeRows(a, b, timeVar))
      );
    }

    function currentDict() {
      return (isScaled && hasScaled) ? stlDictScaled : stlDictUnscaled;
    }

    // ------------------------------------------------------------------
    // Tooltip + shared vertical crosshair spanning all visible sub-plots
    // ------------------------------------------------------------------
    function externalTooltipHandler(context) {
      const { chart, tooltip } = context;
      const tooltipEl = q('.gig-tooltip');
      const crosshair = q('.gig-stl-crosshair');
      const main = q('.gig-stldp-main');

      if (tooltip.opacity === 0) {
        tooltipEl.style.opacity = 0;
        crosshair.style.display = 'none';
        return;
      }

      const mainRect = main.getBoundingClientRect();
      const canvasRect = chart.canvas.getBoundingClientRect();
      const xPos = (canvasRect.left - mainRect.left) + tooltip.caretX;
      const visibleWrappers = qa('.gig-stl-wrapper').filter(w => !w.classList.contains('hidden'));
      if (visibleWrappers.length > 0) {
        const firstKey = CHART_MAP[visibleWrappers[0].dataset.wrap];
        const lastKey = CHART_MAP[visibleWrappers[visibleWrappers.length - 1].dataset.wrap];
        const firstChart = stlCharts[firstKey], lastChart = stlCharts[lastKey];
        if (firstChart && firstChart.chartArea && lastChart && lastChart.chartArea) {
          const fRect = visibleWrappers[0].getBoundingClientRect();
          const lRect = visibleWrappers[visibleWrappers.length - 1].getBoundingClientRect();
          const topEdge = (fRect.top - mainRect.top) + firstChart.chartArea.top;
          const bottomEdge = (lRect.top - mainRect.top) + lastChart.chartArea.bottom;
          crosshair.style.display = 'block';
          crosshair.style.left = xPos + 'px';
          crosshair.style.top = topEdge + 'px';
          crosshair.style.height = (bottomEdge - topEdge) + 'px';
        }
      }

      if (tooltip.body && tooltip.dataPoints && tooltip.dataPoints.length) {
        const dp = tooltip.dataPoints[0];
        const trueIdx = chart.data.datasets[dp.datasetIndex]._trueIndex;
        const d = state.series[trueIdx];
        if (d) {
          const dk = state.displayKeys();
          let locText = state.label(d);
          if (d._depth > 1) {
            locText += ' <span style="opacity:.7;font-size:10px;">(' +
              d[dk[d._depth - 2]] + ')</span>';
          }
          const chartName = chart.options.plugins.title.text;
          const v = dp.parsed.y;
          const fv = typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(4)) : v;
          const color = chart.data.datasets[dp.datasetIndex].borderColor;
          tooltipEl.innerHTML =
            '<div style="font-weight:bold;margin-bottom:6px;border-bottom:1px solid rgba(255,255,255,.2);padding-bottom:4px;display:flex;align-items:center;">' +
            '<span class="gig-tooltip-swatch" style="background-color:' + color + '"></span>' +
            locText + '</div>' +
            '<div>' + timeVar + ': ' + dp.label + '</div>' +
            '<div style="margin-top:3px;">' + chartName + ': ' + fv + '</div>';
        }
      }
      const position = chart.canvas.getBoundingClientRect();
      tooltipEl.style.opacity = 1;
      tooltipEl.style.left = (position.left + tooltip.caretX) + 'px';
      tooltipEl.style.top = (position.top + tooltip.caretY) + 'px';
    }

    // ------------------------------------------------------------------
    // Selection modes (single / multiple / inverse / hierarchy)
    // ------------------------------------------------------------------
    function leafDepth() { return state.displayKeys().length; }

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

    function handleInteraction(chart, activeEls, shift) {
      if (isBoxSelectOn || isLassoSelectOn) return;
      if (!activeEls.length) {
        if (!shift && selectionMode === 'single') {
          selectedIndices.clear();
          applySelectionVisually();
        }
        return;
      }
      const idx = chart.data.datasets[activeEls[0].datasetIndex]._trueIndex;
      processSelection(idx, shift);
    }

    // ------------------------------------------------------------------
    // Box / lasso brushing on each panel (ported from linkvis)
    // ------------------------------------------------------------------
    function attachBrushingToCanvas(canv, getChartInstance) {
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
        const chart = getChartInstance();
        if (!chart) return;
        if (!event.shiftKey) selectedIndices.clear();

        const hits = [];
        chart.data.datasets.forEach((dataset, dsIdx) => {
          if (dataset._trueIndex === undefined) return;
          const meta = chart.getDatasetMeta(dsIdx);
          if (meta.hidden) return;
          for (let i = 0; i < meta.data.length; i++) {
            const pt = meta.data[i];
            if (pt.x === undefined || pt.y === undefined || isNaN(pt.x) || isNaN(pt.y)) continue;
            let hit = false;
            if (mode === 'box' && pointInBox({ x: pt.x, y: pt.y }, box)) hit = true;
            else if (mode === 'lasso' && pointInPolygon({ x: pt.x, y: pt.y }, path)) hit = true;
            if (hit) { hits.push(dataset._trueIndex); break; }
          }
        });

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
      qa('.gig-stl-wrapper canvas').forEach(c => {
        c.style.cursor = (isBoxSelectOn || isLassoSelectOn) ? 'crosshair' : 'default';
      });
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

      const scaleToggle = q('[data-role="scaletoggle"]');
      if (scaleToggle) {
        scaleToggle.addEventListener('change', () => {
          isScaled = scaleToggle.checked;
          updatePlatform();     // axes re-fit automatically to the new values
        });
      }

      q('[data-role="reset"]').addEventListener('click', () => {
        selectedIndices.clear();
        totalDimmed = false;
        state.hiddenValues.clear();
        state.disabled.clear();
        controls.reset();
        isScaled = hasScaled;                  // back to the default scale
        if (scaleToggle) scaleToggle.checked = isScaled;
        state.rebuild();
        hierarchyWidget?.sync();
        updatePlatform();
      });
    }

    // ------------------------------------------------------------------
    // Charts
    // ------------------------------------------------------------------
    function seriesStyle(d, i) {
      const hasSelection = selectedIndices.size > 0;
      const isSel = selectedIndices.has(i);
      const isTop = d._depth === 0;
      if (hasSelection) {
        if (isSel) return { c: state.depthColor(d._depth), w: 2.5, o: -100 - d._depth };
        return { c: 'rgba(200,200,200,0.15)', w: 1, o: 50 + d._depth };
      }
      if (isTop && !totalDimmed) return { c: state.depthColor(d._depth), w: 2.5, o: -100 };
      return { c: 'rgba(200,200,200,0.15)', w: 1, o: 50 + d._depth };
    }

    function initCharts() {
      const common = {
        responsive: true, maintainAspectRatio: false, animation: false, normalized: true,
        elements: { point: { radius: 0, hitRadius: 5 }, line: { borderWidth: 1, tension: 0 } },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false, external: externalTooltipHandler, mode: 'nearest', intersect: false }
        },
        interaction: { mode: 'nearest', axis: 'xy', intersect: false },
        onClick: (e, activeEls, chart) =>
          handleInteraction(chart, activeEls, e.native ? e.native.shiftKey : false)
      };

      // No per-panel heading; the panel name is the y-axis title instead.
      // Bold ticks + bold axis titles; y-axis width pinned so panels align.
      const create = (wrapName, title, yLabel) => new Chart(
        q('.gig-stl-wrapper[data-wrap="' + wrapName + '"] canvas'),
        {
          type: 'line',
          data: { labels: [], datasets: [] },
          options: {
            ...common,
            scales: {
              x: {
                display: false,
                grid: { display: false },
                ticks: { maxTicksLimit: 10, font: { weight: 'bold' } },
                title: { display: false, text: timeVar, align: 'center', font: { size: 11, weight: 'bold' } }
              },
              y: {
                grid: { color: 'rgba(0,0,0,0.05)', lineWidth: 1 },
                border: { display: false },
                ticks: { font: { weight: 'bold' } },
                title: { display: true, text: yLabel, align: 'center', font: { size: 11, weight: 'bold' } },
                afterFit: scale => { scale.width = Y_AXIS_WIDTH; }
              }
            },
            plugins: {
              ...common.plugins,
              // Heading removed; text kept (not displayed) for tooltip labels.
              title: { display: false, text: title, align: 'start' }
            }
          }
        });

      stlCharts = {
        data: create('Data', 'Data', 'Data'),
        trend: create('Trend', 'Trend', 'Trend'),
        season: create('Season', 'Seasonality', 'Seasonality'),
        remainder: create('Remainder', 'Remainder', 'Remainder')
      };
      updateStlAxes();
    }

    // Only the bottom visible panel shows x ticks + the time-column axis title.
    function updateStlAxes() {
      let lastKey = null;
      for (let i = CHART_ORDER.length - 1; i >= 0; i--) {
        const wrap = q('.gig-stl-wrapper[data-wrap="' + CHART_ORDER[i] + '"]');
        if (wrap && !wrap.classList.contains('hidden')) { lastKey = CHART_MAP[CHART_ORDER[i]]; break; }
      }
      Object.keys(stlCharts).forEach(key => {
        const isLast = (key === lastKey);
        stlCharts[key].options.scales.x.display = isLast;
        stlCharts[key].options.scales.x.title.display = isLast;
        stlCharts[key].update('none');
      });
    }

    function updatePlatform() {
      const ds = { data: [], trend: [], season: [], remainder: [] };
      let labels = null;

      state.series.forEach((d, i) => {
        if (state.isSeriesHidden(d)) return;   // hidden via the legend dropdown
        const rows = currentDict()[d._canonicalId] || [];
        if (rows.length === 0) return;
        if (!labels) labels = rows.map(r => r[timeVar]);

        const st = seriesStyle(d, i);
        const mk = (arr) => ({
          data: arr, borderColor: st.c, backgroundColor: st.c, borderWidth: st.w,
          order: st.o, pointRadius: 0, pointHitRadius: 5, tension: 0, fill: false,
          _trueIndex: i
        });
        ds.data.push(mk(rows.map(r => r[valueVar])));
        ds.trend.push(mk(rows.map(r => r.trend)));
        ds.season.push(mk(rows.map(r => r[seasonVar])));
        ds.remainder.push(mk(rows.map(r => r.remainder)));
      });

      Object.keys(stlCharts).forEach(k => {
        stlCharts[k].data.labels = labels || [];
        stlCharts[k].data.datasets = ds[k];
        stlCharts[k].update('none');
      });
    }

    function applySelectionVisually() {
      Object.values(stlCharts).forEach(chart => {
        chart.data.datasets.forEach(dsi => {
          if (dsi._trueIndex === undefined) return;
          const d = state.series[dsi._trueIndex];
          const st = seriesStyle(d, dsi._trueIndex);
          dsi.borderColor = st.c;
          dsi.backgroundColor = st.c;
          dsi.borderWidth = st.w;
          dsi.order = st.o;
        });
        chart.update('none');
      });
    }

    return {
      renderValue: function (x) {
        try {
        renderController?.abort();
        renderController = typeof AbortController === 'function'
          ? new AbortController()
          : { signal: undefined, abort() {} };
        el.innerHTML = TEMPLATE;
        root = el;

        const rows = safeConvert(x.data);
        const sample = rows[0] || {};
        const keys = Object.keys(sample);
        timeVar = resolveTimeColumn(rows, x.time);
        state = createHierState(
          rows,
          resolveGigStructure(x),
          [timeVar, '.model']
        );

        // Detect component columns after reserving the explicit/inferred time
        // index so numeric time cannot be mistaken for the response.
        seasonVar = x.season || keys.find(key => {
          const lower = key.toLowerCase();
          return lower.startsWith('season') && lower !== 'season_adjust';
        }) || 'season_year';
        valueVar = resolveGigValue(x) || keys.find(k =>
          typeof sample[k] === 'number' &&
          k !== timeVar &&
          k !== '.ggelato_time_order' &&
          !['trend', 'remainder', 'season_adjust'].includes(k.toLowerCase()) &&
          !k.toLowerCase().startsWith('season')) || 'value';

        const scaledRows = safeConvert(x.scaled);
        hasScaled = scaledRows.length > 0;
        isScaled = hasScaled;                  // default to Scaled when provided
        buildStlDictionary(rows, stlDictUnscaled);
        if (hasScaled) buildStlDictionary(scaledRows, stlDictScaled);
        // No scaled data -> no switch to flip
        qa('[data-role="scalegroup"]').forEach(n => {
          n.style.display = hasScaled ? '' : 'none';
        });
        initCharts();
        initToolbar();

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
          main: q('.gig-stldp-main'),
          hierarchyWidget,
          signal: renderController.signal,
          onResize: () => {
            Object.values(stlCharts).forEach(chart => { if (chart) chart.resize(); });
          }
        });

        // Component chips (Data / Trend / Seasonality / Remainder)
        qa('.gig-stl-chip').forEach(btn => {
          btn.addEventListener('click', () => {
            btn.classList.toggle('active');
            const wrap = q('.gig-stl-wrapper[data-wrap="' + btn.dataset.comp + '"]');
            if (wrap) wrap.classList.toggle('hidden');
            updateStlAxes();
          });
        });

        // Box / lasso brushing on each panel
        CHART_ORDER.forEach(name => {
          const canv = q('.gig-stl-wrapper[data-wrap="' + name + '"] canvas');
          attachBrushingToCanvas(canv, () => stlCharts[CHART_MAP[name]]);
        });

        updatePlatform();
        } catch (error) {
          showRenderError(error);
        }
      },

      resize: function () {
        Object.values(stlCharts).forEach(c => { if (c) c.resize(); });
      }
    };
  }
});
