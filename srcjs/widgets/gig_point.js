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
import { renderPoint } from '../modules/gig/gig-point-renderer.js';

const TEMPLATE = `
<div class="gig-widget gig-point">
  ${gigToolbarMarkup()}
  <div class="gig-point-main"></div>
  <div class="gig-tooltip"></div>
</div>
`;

HTMLWidgets.widget({
  name: 'gig_point',
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

    function q(sel) { return root.querySelector(sel); }

    function getStyle(d, i) {
      const hasSelection = selectedIndices.size > 0;
      const isSel = selectedIndices.has(i);
      const isTop = d._depth === 0;
      if (hasSelection) {
        if (isSel) return { c: state.depthColor(d._depth), w: 2.5, r: isTop ? 6 : 4, o: 0 };
        return { c: '#e2e8f0', w: 1, r: 2, o: 0 };
      }
      if (isTop && !totalDimmed) return { c: state.depthColor(d._depth), w: 2.5, r: 6, o: 0 };
      return { c: '#e2e8f0', w: 1, r: 2, o: 0 };
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
          q('.gig-point-main canvas').style.cursor =
            (brushState.box || brushState.lasso) ? 'crosshair' : 'default';
        }
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

        const rows = safeConvert(x.data);
        state = createHierState(rows, resolveGigStructure(x));

        const shared = {
          state,
          tools: { box: false, lasso: false },
          tooltipEl: q('.gig-tooltip'),
          signal: renderController.signal,
          resetFns: [],
          listen: (node, type, handler, options) =>
            node.addEventListener(type, handler, { ...(options || {}), signal: renderController.signal }),
          getStyle,
          select,
          brush
        };

        renderer = renderPoint(q('.gig-point-main'), x, shared);
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
          main: q('.gig-point-main'),
          hierarchyWidget,
          signal: renderController.signal,
          onResize: () => renderer?.resize()
        });

        renderer.resize(true);
        renderer.update(true);
      },

      resize: function () {
        renderer?.resize();
      }
    };
  }
});
