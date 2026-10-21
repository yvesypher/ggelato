/*
 * Shared gig_stldp renderer used by the standalone gig_stldp widget and by fridge.
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
const CHART_LABEL = { data: 'Data', trend: 'Trend', season: 'Seasonality', remainder: 'Remainder' };
const Y_AXIS_WIDTH = 78;
const SERIES_LINE_WIDTH = 1;

const FOCUS_MODE = 'gigFocusNearest';

function installFocusMode() {
  const modes = Chart.Interaction && Chart.Interaction.modes;
  if (!modes) return;
  modes[FOCUS_MODE] = function (chart, e) {
    const pos = ('native' in e) ? { x: e.x, y: e.y } : (() => {
      const rect = chart.canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    })();
    const area = chart.chartArea;
    if (!area || pos.x < area.left || pos.x > area.right ||
        pos.y < area.top || pos.y > area.bottom) return [];

    const nLabels = (chart.data.labels || []).length;
    if (!nLabels) return [];
    let index = Math.round(chart.scales.x.getValueForPixel(pos.x));
    index = Math.max(0, Math.min(nLabels - 1, index));

    const metas = chart.getSortedVisibleDatasetMetas().filter(meta => {
      const ds = chart.data.datasets[meta.index];
      return Boolean(ds && ds._gigFocus);
    });
    const nearestIn = candidates => {
      let best = null, bestDist = Infinity;
      candidates.forEach(meta => {
        const el = meta.data[index];
        if (!el || el.skip || !Number.isFinite(el.y)) return;
        const dist = Math.abs(el.y - pos.y);
        if (dist < bestDist) {
          bestDist = dist;
          best = { element: el, datasetIndex: meta.index, index };
        }
      });
      return best;
    };

    const hit = nearestIn(metas);
    return hit ? [hit] : [];
  };
}

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

  function chartKeyOf(chart) {
    return Object.keys(stlCharts).find(k => stlCharts[k] === chart);
  }

  function valueAt(key, datasetIndex, trueIdx, dataIndex) {
    const chart = stlCharts[key];
    if (!chart) return undefined;
    let ds = chart.data.datasets[datasetIndex];
    if (!ds || ds._trueIndex !== trueIdx) {
      ds = chart.data.datasets.find(candidate => candidate._trueIndex === trueIdx);
    }
    return ds ? ds.data[dataIndex] : undefined;
  }

  function formatValue(v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return v == null ? '–' : v;
    return Number.isInteger(v) ? v : v.toFixed(4);
  }

  function seriesFocus(style, i) {
    if (typeof style.focus === 'boolean') return style.focus;
    if (typeof shared.hasSelection === 'function' &&
        typeof shared.isSelected === 'function') {
      return shared.hasSelection() ? Boolean(shared.isSelected(i)) : true;
    }
    return true;
  }

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
        const color = chart.data.datasets[dp.datasetIndex].borderColor;
        const hoveredKey = chartKeyOf(chart);
        const componentRows = CHART_ORDER.map(name => {
          const key = CHART_MAP[name];
          const v = valueAt(key, dp.datasetIndex, trueIdx, dp.dataIndex);
          const style = key === hoveredKey ? 'font-weight:bold;' : 'opacity:.85;';
          return '<div style="display:flex;justify-content:space-between;gap:12px;' + style + '">' +
            '<span>' + CHART_LABEL[key] + '</span><span>' + formatValue(v) + '</span></div>';
        }).join('');
        tooltipEl.innerHTML =
          '<div style="font-weight:bold;margin-bottom:6px;border-bottom:1px solid rgba(255,255,255,.2);padding-bottom:4px;display:flex;align-items:center;">' +
          '<span class="gig-tooltip-swatch" style="background-color:' + color + '"></span>' +
          locText + '</div>' +
          '<div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:3px;">' +
          '<span>' + timeVar + '</span><span>' + dp.label + '</span></div>' +
          componentRows;
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
    installFocusMode();
    const common = {
      responsive: true, maintainAspectRatio: false, animation: false, normalized: true,
      elements: { point: { radius: 0, hitRadius: 5 }, line: { borderWidth: 1, tension: 0 } },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false, external: externalTooltipHandler, mode: FOCUS_MODE, intersect: false }
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
        const focus = seriesFocus(st, i);
        const mk = arr => ({
          data: arr, borderColor: st.c, backgroundColor: st.c, borderWidth: SERIES_LINE_WIDTH,
          order: st.o, pointRadius: 0, pointHitRadius: 5, tension: 0, fill: false,
          _trueIndex: i, _gigFocus: focus
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
          dsi.borderWidth = SERIES_LINE_WIDTH;
          dsi.order = st.o;
          dsi._gigFocus = seriesFocus(st, dsi._trueIndex);
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

  function setScaled(value) {
    isScaled = Boolean(value) && hasScaled;
    update(true);
  }

  return { update, resize, destroy, setScaled, hasScaled };
}
