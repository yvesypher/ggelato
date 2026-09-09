/*
 * Shared gig_stldp renderer used by the standalone gig_stldp widget and by
 * fridge. Draws the four linked Data/Trend/Season/Remainder Chart.js panels,
 * the shared crosshair, and per-panel box/lasso brushing. Toolbar chrome,
 * the Scaled/Original switch UI, and the hierarchy widget belong to the
 * caller.
 */

import {
  attachBrushGesture,
  createBrushOverlay,
  pointInBox,
  pointInPolygon
} from './gig-selection.js';
import { compareTimeRows, resolveGigValue, resolveTimeColumn } from './gig-state.js';
import { dataFrameToRows } from '../core/hierarchy-model.js';

const CHART_ORDER = ['Data', 'Trend', 'Season', 'Remainder'];
const CHART_MAP = { Data: 'data', Trend: 'trend', Season: 'season', Remainder: 'remainder' };
const Y_AXIS_WIDTH = 78;

export function renderStldp(content, x, shared) {
  const rows = dataFrameToRows(x.data);
  const sample = rows[0] || {};
  const keys = Object.keys(sample);
  const timeVar = resolveTimeColumn(rows, x.time);
  const valueVar = resolveGigValue(x) || keys.find(k =>
    typeof sample[k] === 'number' &&
    k !== timeVar &&
    k !== '.ggelato_time_order' &&
    !['trend', 'remainder', 'season_adjust'].includes(k.toLowerCase()) &&
    !k.toLowerCase().startsWith('season')) || 'value';
  // season/trend/remainder are required, not guessed. R's build_gig_stl()
  // already refuses to build this widget without them explicitly mapped via
  // gig_aes(), but that guard only covers the normal R entry point - this
  // check makes the requirement real at the renderer itself too, so a stale
  // cached widget or a direct (non-R) call fails loudly here rather than
  // silently guessing a column and drawing the wrong data.
  //
  // The payload key stays 'season' (unchanged JS/JSON contract) even though
  // the R-facing gig_aes() argument is named `seasonality` - display name
  // and payload key are allowed to differ, same as `x`/`y` map onto the
  // payload's `time`/`value` keys.
  const requiredStlChannels = [
    { payloadKey: 'season', displayName: 'seasonality' },
    { payloadKey: 'trend', displayName: 'trend' },
    { payloadKey: 'remainder', displayName: 'remainder' }
  ];
  const missingStlChannels = requiredStlChannels.filter(c => !x[c.payloadKey]);
  if (missingStlChannels.length) {
    throw new Error(
      `geom_stl() requires \`${missingStlChannels.map(c => c.displayName).join('`, `')}\` to be ` +
      'explicitly mapped via gig_aes() - it does not guess these from ' +
      'column names.'
    );
  }
  const seasonVar = x.season;
  const trendVar = x.trend;
  const remainderVar = x.remainder;

  const scaledRows = dataFrameToRows(x.scaled);
  const hasScaled = scaledRows.length > 0;
  let isScaled = hasScaled;   // used only when shared.isScaled is absent

  const stlDictUnscaled = {};
  const stlDictScaled = {};
  function buildStlDictionary(sourceRows, out) {
    Object.keys(out).forEach(k => delete out[k]);
    sourceRows.forEach(r => {
      const id = shared.state.canonicalId(r);
      if (!out[id]) out[id] = [];
      out[id].push(r);
    });
    Object.values(out).forEach(rowsForSeries =>
      rowsForSeries.sort((a, b) => compareTimeRows(a, b, timeVar))
    );
  }
  buildStlDictionary(rows, stlDictUnscaled);
  if (hasScaled) buildStlDictionary(scaledRows, stlDictScaled);

  // If the caller supplies shared.isScaled (a mutable {v: bool} ref, as
  // fridge does so one switch drives every STL window), read it live.
  // Otherwise fall back to the local flag flipped via setScaled().
  function currentDict() {
    const scaled = shared.isScaled ? Boolean(shared.isScaled.v) : isScaled;
    return (scaled && hasScaled) ? stlDictScaled : stlDictUnscaled;
  }

  content.innerHTML =
    '<div class="gig-stl-controls">' +
      CHART_ORDER.map(c =>
        '<button class="gig-stl-chip active" data-comp="' + c + '">' +
        (c === 'Season' ? 'Seasonality' : c) + '</button>').join('') +
    '</div>' +
    CHART_ORDER.map(c =>
      '<div class="gig-stl-wrapper" data-wrap="' + c + '"><canvas></canvas></div>').join('') +
    '<div class="gig-stl-crosshair"></div>';

  function q(sel) { return content.querySelector(sel); }
  function qa(sel) { return Array.from(content.querySelectorAll(sel)); }

  const stlCharts = {};
  let destroyed = false;

  function externalTooltipHandler(context) {
    const { chart, tooltip } = context;
    const tooltipEl = shared.tooltipEl;
    const crosshair = q('.gig-stl-crosshair');

    if (tooltip.opacity === 0) {
      tooltipEl.style.opacity = 0;
      crosshair.style.display = 'none';
      return;
    }

    const mainRect = content.getBoundingClientRect();
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
      const d = shared.state.series[trueIdx];
      if (d) {
        const dk = shared.state.displayKeys();
        let locText = shared.state.label(d);
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

  function handleInteraction(chart, activeEls, shiftKey) {
    if (shared.tools.box || shared.tools.lasso) return;
    if (!activeEls.length) { shared.select(-1, shiftKey); return; }
    const idx = chart.data.datasets[activeEls[0].datasetIndex]._trueIndex;
    shared.select(idx, shiftKey);
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
            title: { display: false, text: title, align: 'start' }
          }
        }
      });

    Object.assign(stlCharts, {
      data: create('Data', 'Data', 'Data'),
      trend: create('Trend', 'Trend', 'Trend'),
      season: create('Season', 'Seasonality', 'Seasonality'),
      remainder: create('Remainder', 'Remainder', 'Remainder')
    });
    updateStlAxes();
  }

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

  qa('.gig-stl-chip').forEach(btn => {
    shared.listen(btn, 'click', () => {
      btn.classList.toggle('active');
      const wrap = q('.gig-stl-wrapper[data-wrap="' + btn.dataset.comp + '"]');
      if (wrap) wrap.classList.toggle('hidden');
      updateStlAxes();
    });
  });

  function attachBrushingToCanvas(canv, getChartInstance) {
    const wrapper = canv.parentElement;
    const brushSvg = createBrushOverlay(wrapper);
    attachBrushGesture({
      surface: canv,
      overlay: brushSvg,
      signal: shared.signal,
      getPoint: event => {
        const rect = canv.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
      },
      getMode: () => shared.tools.box ? 'box' : (shared.tools.lasso ? 'lasso' : null),
      onComplete: ({ event, mode, path, box }) => {
        const chart = getChartInstance();
        if (!chart) return;
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
        shared.brush(hits, event.shiftKey);
      }
    });
  }

  initCharts();
  CHART_ORDER.forEach(name => {
    const canv = q('.gig-stl-wrapper[data-wrap="' + name + '"] canvas');
    attachBrushingToCanvas(canv, () => stlCharts[CHART_MAP[name]]);
  });

  // ---- crispness on browser zoom (devicePixelRatio changes) ----
  let lastDpr = window.devicePixelRatio;
  let dprTimer = null;
  shared.listen(window, 'resize', () => {
    clearTimeout(dprTimer);
    dprTimer = setTimeout(() => {
      if (window.devicePixelRatio !== lastDpr) {
        lastDpr = window.devicePixelRatio;
        Object.values(stlCharts).forEach(c => { if (c) c.resize(); });
      }
    }, 100);
  });

  shared.resetFns.push(() => { isScaled = hasScaled; });

  function update(full) {
    if (full) {
      const ds = { data: [], trend: [], season: [], remainder: [] };
      let labels = null;
      const dict = currentDict();

      shared.state.series.forEach((d, i) => {
        if (shared.state.isSeriesHidden(d)) return;
        const rowsForSeries = dict[d._canonicalId] || [];
        if (rowsForSeries.length === 0) return;
        if (!labels) labels = rowsForSeries.map(r => r[timeVar]);

        const st = shared.getStyle(d, i);
        const mk = arr => ({
          data: arr, borderColor: st.c, backgroundColor: st.c, borderWidth: st.w,
          order: st.o, pointRadius: 0, pointHitRadius: 5, tension: 0, fill: false,
          _trueIndex: i
        });
        ds.data.push(mk(rowsForSeries.map(r => r[valueVar])));
        ds.trend.push(mk(rowsForSeries.map(r => r[trendVar])));
        ds.season.push(mk(rowsForSeries.map(r => r[seasonVar])));
        ds.remainder.push(mk(rowsForSeries.map(r => r[remainderVar])));
      });

      Object.keys(stlCharts).forEach(k => {
        stlCharts[k].data.labels = labels || [];
        stlCharts[k].data.datasets = ds[k];
        stlCharts[k].update('none');
      });
    } else {
      Object.values(stlCharts).forEach(chart => {
        chart.data.datasets.forEach(dsi => {
          if (dsi._trueIndex === undefined) return;
          const st = shared.getStyle(shared.state.series[dsi._trueIndex], dsi._trueIndex);
          dsi.borderColor = st.c;
          dsi.backgroundColor = st.c;
          dsi.borderWidth = st.w;
          dsi.order = st.o;
        });
        chart.update('none');
      });
    }
  }

  function resize() {
    Object.values(stlCharts).forEach(c => { if (c) c.resize(); });
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    Object.values(stlCharts).forEach(c => c.destroy());
  }

  // For standalone use, where the toolbar (not `shared.isScaled`) owns the
  // switch. fridge instead sets shared.isScaled.v and calls update(true).
  function setScaled(value) {
    isScaled = Boolean(value) && hasScaled;
    update(true);
  }

  return { update, resize, destroy, setScaled, hasScaled };
}
