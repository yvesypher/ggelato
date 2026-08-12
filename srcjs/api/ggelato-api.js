/*
 * Public browser API consumed by composition packages such as fridge.
 *
 * ggelato remains the single owner of hierarchy parsing, state, selection,
 * hierarchy widget rendering, and native plot renderers shared with a
 * composition platform. Consumers load the generated
 * inst/htmlwidgets/lib/ggelato-api/ggelato-api.js dependency instead of
 * copying these modules into their own bundles.
 */

import {
  TOTAL_KEY,
  createDepthColors,
  dataFrameToRows,
  parseStructure
} from "../modules/core/hierarchy-model.js";
import {
  HIERARCHY_WIDGET_BUILD,
  createHierarchyWidget
} from "../modules/core/hierarchy-widget.js";
import {
  createGigHierarchyAdapter
} from "../modules/gig/gig-selection.js";
import {
  createHierState
} from "../modules/gig/gig-state.js";
import {
  renderSunburst
} from "../modules/gig/gig-sunburst-renderer.js";

const API_BUILD = "2026-07-28.5";

window.ggelatoAPI = Object.freeze({
  API_BUILD,
  HIERARCHY_WIDGET_BUILD,
  TOTAL_KEY,
  createDepthColors,
  createGigHierarchyAdapter,
  createHierState,
  createHierarchyWidget,
  dataFrameToRows,
  parseStructure,
  renderSunburst
});
