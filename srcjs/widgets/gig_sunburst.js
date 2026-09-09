import {
  applyBrushSelection,
  createGigHierarchyAdapter,
  updateGigSelection
} from '../modules/gig/gig-selection.js';
import {
  createHierState,
  resolveGigStructure
} from '../modules/gig/gig-state.js';
import { gigToolbarMarkup, initGigToolbarControls } from '../modules/gig/gig-toolbar.js';
import { initGigChrome } from '../modules/gig/gig-layout.js';
import { createHierarchyWidget } from '../modules/core/hierarchy-widget.js';
import { dataFrameToRows as safeConvert } from '../modules/core/hierarchy-model.js';
import { renderSunburst } from '../modules/gig/gig-sunburst-renderer.js';

const TEMPLATE = `
<div class="gig-widget gig-sunburst">
  ${gigToolbarMarkup({ includeLabels: true, inverseFirst: 'Within Current Level', inverseSecond: 'Across All Levels' })}
  <div class="gig-sunburst-main"></div>
</div>
`;

HTMLWidgets.widget({
  name: 'gig_sunburst',
  type: 'output',

  factory: function (el, width, height) {
    let state = null;
    const selectedIndices = new Set();
    let totalDimmed = false;
    let root = null;
    let hierarchyWidget = null;
    let chrome = null;
    let renderController = null;
    let renderer = null;
    let selectionMode = 'single';
    const labelsOn = { v: true };

    function q(sel) { return root.querySelector(sel); }

    function getStyle(d, i) {
      const hasSelection = selectedIndices.size > 0;
      const isSel = selectedIndices.has(i);
      const isTop = d._depth === 0;
      let c, w;
      if (hasSelection) {
        if (isSel) { c = state.depthColor(d._depth); w = 2.5; }
        else { c = '#e2e8f0'; w = 1; }
      } else if (isTop && !totalDimmed) {
        c = state.depthColor(d._depth); w = 2.5;
      } else {
        c = '#e2e8f0'; w = 1;
      }
      return { c, w, r: 0, o: 0 };
    }

    function select(index, shift) {
      updateGigSelection({ state, selectedIndices, index, shift, mode: selectionMode });
      renderer?.update(false);
    }

    function brush(hits, shift) {
      if (!shift) selectedIndices.clear();
      applyBrushSelection({ hits, state, selectedIndices, mode: selectionMode });
      renderer?.update(false);
    }

    function initToolbar(shared) {
      const controls = initGigToolbarControls({
        root,
        signal: renderController.signal,
        onSelectionModeChange: mode => { selectionMode = mode; },
        onBrushModeChange: brushState => {
          shared.tools.box = brushState.box;
          shared.tools.lasso = brushState.lasso;
        }
      });

      const labelsBtn = q('[data-role="labels"]');
      labelsBtn.classList.toggle('active', labelsOn.v);
      labelsBtn.addEventListener('click', () => {
        labelsOn.v = !labelsOn.v;
        labelsBtn.classList.toggle('active', labelsOn.v);
        renderer?.update(false);
      });

      q('[data-role="reset"]').addEventListener('click', () => {
        selectedIndices.clear();
        totalDimmed = false;
        state.hiddenValues.clear();
        state.disabled.clear();
        controls.reset();
        state.rebuild();
        hierarchyWidget?.sync();
        shared.resetFns.forEach(fn => fn());
        renderer?.update(true);
      });
    }

    return {
      renderValue: function (x) {
        renderController?.abort();
        renderController = new AbortController();
        el.innerHTML = TEMPLATE;
        root = el;

        labelsOn.v = x.labels !== false;

        const rows = safeConvert(x.data);
        state = createHierState(rows, resolveGigStructure(x));

        const tooltipEl = document.createElement('div');
        tooltipEl.className = 'gig-tooltip';
        root.appendChild(tooltipEl);

        const shared = {
          state,
          tools: { box: false, lasso: false },
          tooltipEl,
          labelsOn,
          signal: renderController.signal,
          resetFns: [],
          listen: (node, type, handler, options) =>
            node.addEventListener(type, handler, { ...(options || {}), signal: renderController.signal }),
          getStyle,
          select,
          brush
        };

        renderer = renderSunburst(q('.gig-sunburst-main'), x, shared);
        initToolbar(shared);

        const hierarchyAdapter = createGigHierarchyAdapter({
          state,
          selectedIndices,
          getTotalDimmed: () => totalDimmed,
          setTotalDimmed: value => { totalDimmed = value; },
          onSelectionChange: () => renderer?.update(false),
          onStructureChange: () => renderer?.update(true),
          onVisibilityChange: () => renderer?.update(true)
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

        renderer.update(true);
      },

      resize: function () {
        renderer?.resize();
      }
    };
  }
});
