/*
 * Shared gig_point renderer used by the standalone gig_point widget and by fridge.
 */

import {
  attachBrushGesture,
  createBrushOverlay,
  pointInBox,
  pointInPolygon
} from './gig-selection.js';
import { dataFrameToRows } from '../core/hierarchy-model.js';

const POINT_RADIUS = 2;

export function renderPoint(content, x, shared) {
  const rows = dataFrameToRows(x.data);
  const sample = rows[0] || {};
  const features = Object.keys(sample).filter(k => typeof sample[k] === 'number');
  const feats = {
    X: (x.xvar && features.includes(x.xvar)) ? x.xvar : features[0],
    Y: (x.yvar && features.includes(x.yvar)) ? x.yvar : (features[1] || features[0])
  };

  let pointIndexMap = [];
  let plotted = [];   // [{ i, x, y }] for every visible point, in series order
  let hasUserZoomed = false;
  let clickMoved = false;
  let destroyed = false;
  let lastGridWidth = -1;
  let lastGridHeight = -1;

  content.innerHTML =
    '<div class="gig-scatter-grid">' +
      '<div class="gig-y-axis-area"><select class="gig-axis-select" data-role="featY"></select></div>' +
      '<div class="gig-chart-wrap"><canvas></canvas></div>' +
      '<div class="gig-x-axis-area"><select class="gig-axis-select" data-role="featX"></select></div>' +
    '</div>';

  const canv = content.querySelector('.gig-chart-wrap canvas');

  ['featX', 'featY'].forEach(role => {
    const sel = content.querySelector('[data-role="' + role + '"]');
    features.forEach(f => {
      const op = document.createElement('option');
      op.value = f; op.text = f;
      if ((role === 'featX' && f === feats.X) || (role === 'featY' && f === feats.Y)) op.selected = true;
      sel.appendChild(op);
    });
    shared.listen(sel, 'change', e => {
      if (role === 'featX') feats.X = e.target.value; else feats.Y = e.target.value;
      hasUserZoomed = false;
      update(true);
    });
  });

  function externalTooltipHandler(context) {
    const { chart, tooltip } = context;
    const tooltipEl = shared.tooltipEl;
    if (tooltip.opacity === 0) { tooltipEl.style.opacity = 0; return; }
    if (tooltip.dataPoints && tooltip.dataPoints.length) {
      const dp = tooltip.dataPoints[0];
      const idx = pointIndexMap[dp.dataIndex];
      const d = shared.state.series[idx];
      if (d) {
        const dk = shared.state.displayKeys();
        let locText = shared.state.label(d);
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
          '<div>' + feats.X + ': ' + fv(dp.parsed.x) + '</div>' +
          '<div style="margin-top:3px;">' + feats.Y + ': ' + fv(dp.parsed.y) + '</div>';
      }
    }
    const position = chart.canvas.getBoundingClientRect();
    tooltipEl.style.opacity = 1;
    tooltipEl.style.left = (position.left + tooltip.caretX) + 'px';
    tooltipEl.style.top = (position.top + tooltip.caretY) + 'px';
  }

  function handleInteraction(activeEls, shiftKey, moved) {
    if (shared.tools.box || shared.tools.lasso || moved) return;
    if (!activeEls.length) { shared.select(-1, shiftKey); return; }
    const idx = pointIndexMap[activeEls[0].index];
    if (idx !== undefined) shared.select(idx, shiftKey);
  }

  if (!Chart.Interaction.modes.gigSingleNearest) {
    Chart.Interaction.modes.gigSingleNearest = function(chart, event, options, useFinalPosition) {
      const hits = Chart.Interaction.modes.nearest(chart, event, options, useFinalPosition);
      return hits.length ? [hits[0]] : [];
    };
  }

  const chart = new Chart(canv, {
    type: 'scatter',
    data: { datasets: [{
      data: [], backgroundColor: [],
      pointRadius: POINT_RADIUS, pointHoverRadius: POINT_RADIUS, pointHitRadius: 5
    }] },
    options: {
      responsive: false, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'gigSingleNearest', intersect: true, axis: 'xy' },
      scales: {
        x: { type: 'linear', ticks: { font: { weight: 'bold' } },
             grid: { color: 'rgba(0,0,0,0.05)' }, border: { display: false } },
        y: { type: 'linear', ticks: { font: { weight: 'bold' } },
             grid: { color: 'rgba(0,0,0,0.05)' }, border: { display: false } }
      },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false, external: externalTooltipHandler, mode: 'gigSingleNearest', intersect: true }
      },
      onClick: (e, activeEls) =>
        handleInteraction(activeEls, e.native ? e.native.shiftKey : false, clickMoved)
    }
  });

  // ---- zoom / pan ----
  let isPanning = false, startX, startY;
  shared.listen(canv, 'wheel', e => {
    if (shared.tools.box || shared.tools.lasso) return;
    e.preventDefault();
    hasUserZoomed = true;
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    const xAxis = chart.scales.x, yAxis = chart.scales.y;
    if (!xAxis || !yAxis) return;
    const xData = xAxis.getValueForPixel(e.offsetX);
    const yData = yAxis.getValueForPixel(e.offsetY);
    const xRange = xAxis.max - xAxis.min, yRange = yAxis.max - yAxis.min;
    const xProp = (xData - xAxis.min) / xRange, yProp = (yData - yAxis.min) / yRange;
    chart.options.scales.x.min = xData - (xRange * zoomFactor * xProp);
    chart.options.scales.x.max = xData + (xRange * zoomFactor * (1 - xProp));
    chart.options.scales.y.min = yData - (yRange * zoomFactor * yProp);
    chart.options.scales.y.max = yData + (yRange * zoomFactor * (1 - yProp));
    chart.update('none');
  }, { passive: false });

  shared.listen(canv, 'mousedown', e => {
    if (shared.tools.box || shared.tools.lasso) return;
    isPanning = true;
    clickMoved = false;
    startX = e.offsetX;
    startY = e.offsetY;
  });
  shared.listen(window, 'mousemove', e => {
    if (!isPanning) return;
    const r = canv.getBoundingClientRect();
    const currX = e.clientX - r.left, currY = e.clientY - r.top;
    if (Math.abs(currX - startX) < 2 && Math.abs(currY - startY) < 2) return;
    clickMoved = true;
    hasUserZoomed = true;
    const xAxis = chart.scales.x, yAxis = chart.scales.y;
    if (!xAxis || !yAxis) return;
    const dxData = (xAxis.max - xAxis.min) / xAxis.width * (currX - startX);
    const dyData = (yAxis.max - yAxis.min) / yAxis.height * (currY - startY);
    chart.options.scales.x.min = xAxis.min - dxData;
    chart.options.scales.x.max = xAxis.max - dxData;
    chart.options.scales.y.min = yAxis.min + dyData;
    chart.options.scales.y.max = yAxis.max + dyData;
    startX = currX;
    startY = currY;
    chart.update('none');
  });
  shared.listen(window, 'mouseup', () => { isPanning = false; });
  shared.listen(canv, 'mouseleave', () => { isPanning = false; });

  // ---- crispness on browser zoom (devicePixelRatio changes) ----
  let lastDpr = window.devicePixelRatio;
  let dprTimer = null;
  shared.listen(window, 'resize', () => {
    clearTimeout(dprTimer);
    dprTimer = setTimeout(() => {
      if (window.devicePixelRatio !== lastDpr) {
        lastDpr = window.devicePixelRatio;
        chart.resize();
      }
    }, 100);
  });

  // ---- box / lasso brushing ----
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
      const hits = [];
      const meta = chart.getDatasetMeta(0);
      for (let i = 0; i < meta.data.length; i++) {
        const pt = meta.data[i];
        if (pt.x === undefined || pt.y === undefined || isNaN(pt.x) || isNaN(pt.y)) continue;
        let hit = false;
        if (mode === 'box' && pointInBox({ x: pt.x, y: pt.y }, box)) hit = true;
        else if (mode === 'lasso' && pointInPolygon({ x: pt.x, y: pt.y }, path)) hit = true;
        if (hit && pointIndexMap[i] !== undefined) hits.push(pointIndexMap[i]);
      }
      shared.brush(hits, event.shiftKey);
    }
  });

  shared.resetFns.push(() => {
    hasUserZoomed = false;
    delete chart.options.scales.x.min;
    delete chart.options.scales.x.max;
    delete chart.options.scales.y.min;
    delete chart.options.scales.y.max;
  });

  function applyStyles() {
    const styled = plotted.map(p => ({ p, st: shared.getStyle(shared.state.series[p.i], p.i) }));
    styled.sort((a, b) => (Number(b.st.o) || 0) - (Number(a.st.o) || 0));
    const pts = [], cols = [];
    pointIndexMap = [];
    styled.forEach(({ p, st }) => {
      pts.push({ x: p.x, y: p.y });
      cols.push(st.c);
      pointIndexMap.push(p.i);
    });
    Object.assign(chart.data.datasets[0], { data: pts, backgroundColor: cols });
    chart.update('none');
  }

  function update(full) {
    if (!full) { applyStyles(); return; }

    plotted = [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    shared.state.series.forEach((d, i) => {
      if (shared.state.isSeriesHidden(d)) return;
      const px = +d[feats.X], py = +d[feats.Y];
      if (isNaN(px) || isNaN(py)) return;
      if (px < minX) minX = px; if (px > maxX) maxX = px;
      if (py < minY) minY = py; if (py > maxY) maxY = py;
      plotted.push({ i, x: px, y: py });
    });

    if (!hasUserZoomed && minX !== Infinity) {
      let xPad = (maxX - minX) * 0.05; if (xPad === 0) xPad = 1;
      let yPad = (maxY - minY) * 0.05; if (yPad === 0) yPad = 1;
      chart.options.scales.x.min = minX - xPad;
      chart.options.scales.x.max = maxX + xPad;
      chart.options.scales.y.min = minY - yPad;
      chart.options.scales.y.max = maxY + yPad;
    }

    applyStyles();
  }

  function resize(force) {
    const style = window.getComputedStyle(content);
    const number = property => Number.parseFloat(style[property]) || 0;
    const availableWidth = Math.max(0, content.clientWidth - number('paddingLeft') - number('paddingRight'));
    const availableHeight = Math.max(0, content.clientHeight - number('paddingTop') - number('paddingBottom'));
    const yGutter = 44, xGutter = 36;
    const side = Math.max(0, Math.floor(Math.min(availableWidth - yGutter, availableHeight - xGutter)));
    if (side < 1) return;

    const gridWidth = side + yGutter, gridHeight = side + xGutter;
    if (!force && gridWidth === lastGridWidth && gridHeight === lastGridHeight) return;
    lastGridWidth = gridWidth;
    lastGridHeight = gridHeight;

    const grid = content.querySelector('.gig-scatter-grid');
    const wrap2 = content.querySelector('.gig-chart-wrap');
    grid.style.width = gridWidth + 'px';
    grid.style.height = gridHeight + 'px';
    wrap2.style.width = side + 'px';
    wrap2.style.height = side + 'px';
    chart.resize(side, side);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    chart.destroy();
  }

  return { update, resize, destroy };
}
