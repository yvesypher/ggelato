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
import { renderStldp } from '../modules/gig/gig-stldp-renderer.js';

const TEMPLATE = `
<div class="gig-widget gig-stldp">
  ${gigToolbarMarkup({ includeScale: true })}
  <div class="gig-stldp-main"></div>
  <div class="gig-tooltip"></div>
</div>
`;

HTMLWidgets.widget({
  name: 'gig_stldp',
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

    function showRenderError(error) {
      console.error('gig_stldp render failed:', error);
      const target = root?.querySelector('.gig-stldp-main') || el;
      target.replaceChildren();
      const notice = document.createElement('div');
      notice.className = 'gig-render-error';
      Object.assign(notice.style, {
        margin: 'auto', maxWidth: '680px', padding: '16px 20px',
        border: '1px solid #fecaca', borderRadius: '8px', background: '#fff7f7',
        color: '#991b1b', fontFamily: 'sans-serif', fontSize: '13px', lineHeight: '1.45'
      });
      notice.textContent = `gig_stldp could not render: ${error?.message || error}`;
      target.appendChild(notice);
    }

    function getStyle(d, i) {
      const hasSelection = selectedIndices.size > 0;
      const isSel = selectedIndices.has(i);
      const isTop = d._depth === 0;
      if (hasSelection) {
        if (isSel) return { c: state.depthColor(d._depth), w: 2.5, r: 0, o: -100 - d._depth };
        return { c: 'rgba(200,200,200,0.15)', w: 1, r: 0, o: 50 + d._depth };
      }
      if (isTop && !totalDimmed) return { c: state.depthColor(d._depth), w: 2.5, r: 0, o: -100 };
      return { c: 'rgba(200,200,200,0.15)', w: 1, r: 0, o: 50 + d._depth };
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

      const scaleToggle = q('[data-role="scaletoggle"]');
      if (scaleToggle) {
        scaleToggle.checked = renderer.hasScaled;
        scaleToggle.addEventListener('change', () => renderer.setScaled(scaleToggle.checked));
      }
      root.querySelectorAll('[data-role="scalegroup"]').forEach(n => {
        n.style.display = renderer.hasScaled ? '' : 'none';
      });

      q('[data-role="reset"]').addEventListener('click', () => {
        selectedIndices.clear();
        totalDimmed = false;
        state.hiddenValues.clear();
        state.disabled.clear();
        controls.reset();
        state.rebuild();
        hierarchyWidget?.sync();
        if (scaleToggle) scaleToggle.checked = renderer.hasScaled;
        renderer.setScaled(renderer.hasScaled);
      });
    }

    return {
      renderValue: function (x) {
        try {
          renderController?.abort();
          renderController = new AbortController();
          el.innerHTML = TEMPLATE;
          root = el;

          const rows = safeConvert(x.data);
          state = createHierState(rows, resolveGigStructure(x), [x.time, '.model']);

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
            brush,
            // Tooltip focus: with a selection active, hovering snaps only to
            // selected series instead of the dimmed background lines.
            hasSelection: () => selectedIndices.size > 0,
            isSelected: i => selectedIndices.has(i)
          };

          renderer = renderStldp(q('.gig-stldp-main'), x, shared);
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
            main: q('.gig-stldp-main'),
            hierarchyWidget,
            signal: renderController.signal,
            onResize: () => renderer?.resize()
          });

          renderer.update(true);
        } catch (error) {
          showRenderError(error);
        }
      },

      resize: function () {
        renderer?.resize();
      }
    };
  }
});
