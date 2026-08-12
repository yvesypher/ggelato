import {
  applyBrushSelection,
  attachBrushGesture,
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
import { initGigChrome } from '../modules/gig/gig-layout.js';
import { createHierarchyWidget } from '../modules/core/hierarchy-widget.js';
import {
  dataFrameToRows as safeConvert,
  escapeHtml
} from '../modules/core/hierarchy-model.js';

// Plot-specific CSS remains in gig_sunburst.yaml; the shared hierarchy widget
// stylesheet is attached by create_gig_widget().

const TEMPLATE = `
<div class="gig-widget gig-sunburst">
  ${gigToolbarMarkup({ includeLabels: true, inverseFirst: 'Within Current Level', inverseSecond: 'Across All Levels' })}
  <div class="gig-sunburst-main">
    <svg viewBox="-250 -250 500 500" preserveAspectRatio="xMidYMid meet">
      <rect x="-2500" y="-2500" width="5000" height="5000" fill="transparent" stroke="none"></rect>
      <g class="gig-tree-group"></g>
    </svg>
    <div class="gig-sunburst-tooltip"></div>
  </div>
</div>
`;

HTMLWidgets.widget({
  name: 'gig_sunburst',
  type: 'output',

  factory: function (el, width, height) {
    let state = null;
    let treeNodes = null;
    let radiusStep = 55;
    let labelsOn = true;
    const selectedIndices = new Set();
    let totalDimmed = false;
    let root = null;
    let hierarchyWidget = null;
    let chrome = null;
    let renderController = null;

    // Toolbar state
    let selectionMode = 'single';
    let isBoxSelectOn = false, isLassoSelectOn = false;

    // Zoom/pan state (needed for brushing hit tests)
    let treeX = 0, treeY = 0, treeZoom = 1;
    let zoomBehavior = null;

    function q(sel) { return root.querySelector(sel); }
    function qa(sel) { return Array.from(root.querySelectorAll(sel)); }
    function svgEl() { return q('.gig-sunburst-main svg'); }

    function hierarchyPath(d) {
      if (d.data._depth === 0) return ['Total'];
      const keys = state.displayKeys().slice(0, d.data._depth);
      return keys.map(key => d.data[key]).filter(value => value != null && String(value).trim() !== '');
    }

    function truncateLabel(value, maxChars) {
      const text = String(value == null ? '' : value);
      return text.length > maxChars ? text.slice(0, Math.max(1, maxChars - 1)) + '\u2026' : text;
    }

    // Every node keeps its label. Deeper, narrow arcs use correspondingly
    // smaller type, so labels do not overlap and become legible on zoom.
    function shouldShowLabel(d) {
      return labelsOn;
    }

    function labelFontSize(d) {
      if (d.data._depth === 0) return 13;
      if (d.data._depth === 1) return 11;

      // For a leaf, use the length of its outer edge because its label is
      // positioned outside the sunburst. Other levels use their mid-arc.
      // Keeping the text height below that edge prevents adjacent labels
      // from overlapping; the existing D3 zoom enlarges small labels.
      const edgeLength = (d.x1 - d.x0) * (d.children ? (d.y0 + d.y1) / 2 : d.y1);
      return Math.max(0.75, Math.min(9, edgeLength * 0.68));
    }

    // ------------------------------------------------------------------
    // Tree (radial partition), rebuilt from the NON-hidden series so the
    // sunburst re-partitions to fit the rest when something is hidden.
    // ------------------------------------------------------------------
    function initTree() {
      let maxDepth = 0;
      const flatNodes = [];
      state.series.forEach((d, i) => {
        if (state.isSeriesHidden(d)) return;
        flatNodes.push({ ...d, _gIdx: i, children: [] });
      });
      const rootNodes = [];

      flatNodes.forEach(node => {
        if (node._depth > maxDepth) maxDepth = node._depth;
        if (node._depth > 0) {
          const parent = flatNodes.find(n => n._id === node._parentId && n._depth === node._depth - 1);
          if (parent) parent.children.push(node);
          else rootNodes.push(node);
        } else {
          rootNodes.push(node);
        }
      });

      let hierarchyRoot;
      if (rootNodes.length > 1) hierarchyRoot = { _id: 'VIRTUAL_ROOT', _depth: -1, children: rootNodes };
      else if (rootNodes.length === 1) hierarchyRoot = rootNodes[0];
      else { treeNodes = []; return; }

      radiusStep = Math.min(55, 170 / (maxDepth + 1));

      const rootD3 = d3.hierarchy(hierarchyRoot)
        .sum(d => (d.children && d.children.length > 0) ? 0 : 1)
        .sort((a, b) => b.value - a.value);

      const isVirtual = rootNodes.length > 1;
      d3.partition().size([2 * Math.PI, 1])(rootD3);

      treeNodes = rootD3.descendants()
        .filter(d => d.data._id !== 'VIRTUAL_ROOT')
        .map(d => {
          const realDepth = isVirtual ? d.depth - 1 : d.depth;
          d.y0 = realDepth === 0 ? 0 : realDepth * radiusStep;
          d.y1 = (realDepth + 1) * radiusStep;
          return d;
        });
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
      updateStyles();
    }

    function handleArcClick(event, gIdx) {
      event.stopPropagation();
      if (isBoxSelectOn || isLassoSelectOn) return;
      processSelection(gIdx, event.shiftKey);
    }

    // ------------------------------------------------------------------
    // Render + styles
    // ------------------------------------------------------------------
    function renderTree() {
      if (!treeNodes) return;
      const g = d3.select(root).select('.gig-tree-group');
      g.selectAll('*').remove();
      const tooltip = q('.gig-sunburst-tooltip');
      const main = q('.gig-sunburst-main');

      const arc = d3.arc()
        .startAngle(d => d.x0)
        .endAngle(d => d.x1)
        .innerRadius(d => d.y0)
        .outerRadius(d => d.y1)
        .padAngle(0);

      const nodes = g.selectAll('g.gig-node-group')
        .data(treeNodes)
        .enter().append('g')
        .attr('class', 'gig-node-group');

      nodes.append('path')
        .attr('class', 'gig-tree-node')
        .attr('data-gidx', d => d.data._gIdx)
        .attr('d', arc)
        .on('click', (event, d) => handleArcClick(event, d.data._gIdx))
        .on('mousemove', (event, d) => {
          const r = main.getBoundingClientRect();
          const name = state.label(d.data) || 'Total';
          const pathParts = hierarchyPath(d);
          const path = pathParts.map(escapeHtml).join(' <span aria-hidden="true">\u203a</span> ');
          tooltip.innerHTML = '<div class="gig-sunburst-tooltip-name">' + escapeHtml(name) + '</div>' +
            (pathParts.length > 1
              ? '<div class="gig-sunburst-tooltip-path">' + path + '</div>'
              : '');
          tooltip.style.display = 'block';
          tooltip.style.left = (event.clientX - r.left + 12) + 'px';
          tooltip.style.top = (event.clientY - r.top + 12) + 'px';
        })
        .on('mouseleave', () => {
          tooltip.style.display = 'none';
        });

      nodes.append('text')
        .attr('class', d => 'gig-tree-label gig-tree-label-depth-' + d.data._depth +
          (shouldShowLabel(d) ? ' visible' : ''))
        .attr('data-depth', d => d.data._depth)
        .attr('transform', function (d) {
          if (d.data._depth === 0) return '';
          const angle = (d.x0 + d.x1) / 2;
          const radius = d.children ? (d.y0 + d.y1) / 2 : d.y1 + 5;
          const tx = radius * Math.sin(angle);
          const ty = -radius * Math.cos(angle);
          let rot = (angle * 180 / Math.PI) - 90;
          if (rot > 90 && rot < 270) rot += 180;
          return 'translate(' + tx + ', ' + ty + ') rotate(' + rot + ')';
        })
        .attr('dy', '0.35em')
        .attr('text-anchor', d => {
          if (d.data._depth === 0) return 'middle';
          if (!d.children) {
            const rot = ((d.x0 + d.x1) / 2 * 180 / Math.PI) - 90;
            return (rot > 90 && rot < 270) ? 'end' : 'start';
          }
          return 'middle';
        })
        .text(d => {
          let name = state.label(d.data) || '';
          if (d.data._depth === 0) return name;
          const fontSize = labelFontSize(d);
          const ringWidth = d.y1 - d.y0;
          const maxChars = Math.max(3, Math.floor((ringWidth - 6) / (fontSize * 0.56)));
          return truncateLabel(name, maxChars);
        })
        .style('font-size', d => labelFontSize(d) + 'px')
        .style('pointer-events', 'none');

      updateStyles();
    }

    function updateStyles() {
      if (!treeNodes) return;
      const hasSelection = selectedIndices.size > 0;
      treeNodes.forEach(d => {
        const node = root.querySelector('.gig-tree-node[data-gidx="' + d.data._gIdx + '"]');
        if (!node) return;
        const isSel = selectedIndices.has(d.data._gIdx);
        const isTop = d.data._depth === 0;
        let c, w;
        if (hasSelection) {
          if (isSel) { c = state.depthColor(d.data._depth); w = 2.5; }
          else { c = '#e2e8f0'; w = 1; }
        } else if (isTop && !totalDimmed) {
          c = state.depthColor(d.data._depth); w = 2.5;
        } else {
          c = '#e2e8f0'; w = 1;
        }
        node.setAttribute('fill', c);
        node.setAttribute('stroke', '#ffffff');
        node.setAttribute('stroke-width', w);
      });
    }

    // ------------------------------------------------------------------
    // Zoom/pan + box/lasso brushing (ported from linkvis initTreeInteractions)
    // ------------------------------------------------------------------
    function getVbCoords(clientX, clientY) {
      const r = svgEl().getBoundingClientRect();
      const uniformScale = Math.min(r.width / 500, r.height / 500);
      const offsetX = (r.width - (500 * uniformScale)) / 2;
      const offsetY = (r.height - (500 * uniformScale)) / 2;
      return {
        x: ((clientX - r.left) - offsetX) / uniformScale - 250,
        y: ((clientY - r.top) - offsetY) / uniformScale - 250
      };
    }

    function initTreeInteractions() {
      const svg = svgEl();
      const d3Svg = d3.select(svg);
      const d3Group = d3.select(root).select('.gig-tree-group');

      zoomBehavior = d3.zoom()
        .scaleExtent([0.1, 10])
        .filter(e => {
          if (isBoxSelectOn || isLassoSelectOn) return false;
          return !e.ctrlKey && !e.button;
        })
        .on('zoom', e => {
          treeX = e.transform.x; treeY = e.transform.y; treeZoom = e.transform.k;
          d3Group.attr('transform', e.transform);
        });
      d3Svg.call(zoomBehavior);

      // Click on the empty background clears the selection (single-mode style)
      d3Svg.on('click', () => {
        if (isBoxSelectOn || isLassoSelectOn) return;
        processSelection(-1, false);
      });

      attachBrushGesture({
        surface: svg,
        overlay: svg,
        signal: renderController?.signal,
        getPoint: event => getVbCoords(event.clientX, event.clientY),
        getMode: () => isBoxSelectOn ? 'box' : (isLassoSelectOn ? 'lasso' : null),
        stopPropagation: false,
        onComplete: ({ event, mode, path, box }) => {
        if (!event.shiftKey) selectedIndices.clear();
        const hits = [];
        (treeNodes || []).forEach(d => {
          const angle = (d.x0 + d.x1) / 2;
          const rMid = (d.y0 + d.y1) / 2, rIn = d.y0 + 5, rOut = d.y1 - 5;
          const testPoints = [
            { x: rMid * Math.sin(angle), y: -rMid * Math.cos(angle) },
            { x: rIn * Math.sin(angle), y: -rIn * Math.cos(angle) },
            { x: rOut * Math.sin(angle), y: -rOut * Math.cos(angle) }
          ];
          for (const pt of testPoints) {
            const vx = (pt.x * treeZoom) + treeX;
            const vy = (pt.y * treeZoom) + treeY;
            let hit = false;
            if (mode === 'box' && pointInBox({ x: vx, y: vy }, box)) hit = true;
            else if (mode === 'lasso' && pointInPolygon({ x: vx, y: vy }, path)) hit = true;
            if (hit) { hits.push(d.data._gIdx); break; }
          }
        });

        applyBrushSelection({
          hits,
          state,
          selectedIndices,
          mode: selectionMode
        });
        updateStyles();
        }
      });
    }

    // ------------------------------------------------------------------
    // Toolbar (selection tools + labels toggle + dock/float/minimize)
    // ------------------------------------------------------------------
    function updateCursors() {
      svgEl().style.cursor = (isBoxSelectOn || isLassoSelectOn) ? 'crosshair' : 'grab';
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

      const labelsBtn = q('[data-role="labels"]');
      labelsBtn.addEventListener('click', () => {
        labelsOn = !labelsOn;
        labelsBtn.classList.toggle('active', labelsOn);
        d3.select(root).selectAll('.gig-tree-label')
          .classed('visible', d => shouldShowLabel(d));
      });

      q('[data-role="reset"]').addEventListener('click', () => {
        selectedIndices.clear();
        totalDimmed = false;
        state.hiddenValues.clear();
        state.disabled.clear();
        controls.reset();
        if (zoomBehavior) d3.select(svgEl()).call(zoomBehavior.transform, d3.zoomIdentity);
        treeX = 0; treeY = 0; treeZoom = 1;
        state.rebuild();
        hierarchyWidget?.sync();
        initTree();
        renderTree();
      });
    }

    return {
      renderValue: function (x) {
        renderController?.abort();
        renderController = new AbortController();
        el.innerHTML = TEMPLATE;
        root = el;

        labelsOn = x.labels !== false;
        q('[data-role="labels"]').classList.toggle('active', labelsOn);

        const rows = safeConvert(x.data);
        state = createHierState(rows, resolveGigStructure(x));

        initToolbar();
        initTreeInteractions();
        updateCursors();

        const hierarchyAdapter = createGigHierarchyAdapter({
          state,
          selectedIndices,
          getTotalDimmed: () => totalDimmed,
          setTotalDimmed: value => { totalDimmed = value; },
          onSelectionChange: updateStyles,
          onStructureChange: () => {
            initTree();
            renderTree();
          },
          onVisibilityChange: () => {
            initTree();
            renderTree();
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
          main: q('.gig-sunburst-main'),
          hierarchyWidget,
          signal: renderController.signal
        });

        initTree();
        renderTree();
      },

      resize: function () { /* SVG scales via viewBox */ }
    };
  }
});
