/* Shared browser API for ggelato */

import {
  TOTAL_KEY,
  TOTAL_COLOR,
  LEVEL_COLOR_STOPS,
  dataFrameToRows,
  isAggregatedValue,
  createDepthColors,
  parseStructure,
  isValidHierarchyOrder,
  requiredAncestors,
  escapeHtml
} from '../modules/core/hierarchy-model.js';

import {
  createHierarchyWidget,
  hierarchyConnectorPath,
  HIERARCHY_WIDGET_BUILD
} from '../modules/core/hierarchy-widget.js';

import {
  createHierState,
  resolveGigStructure,
  resolveGigValue,
  resolveTimeColumn,
  compareTimeRows,
  timeSortValue
} from '../modules/gig/gig-state.js';

import {
  getDescendantIndices,
  updateGigSelection,
  applyBrushSelection,
  createGigHierarchyAdapter,
  attachBrushGesture,
  createBrushOverlay,
  pointInBox,
  pointInPolygon
} from '../modules/gig/gig-selection.js';

import { renderSunburst } from '../modules/gig/gig-sunburst-renderer.js';
import { renderPoint } from '../modules/gig/gig-point-renderer.js';
import { renderStldp } from '../modules/gig/gig-stldp-renderer.js';

const GGELATO_API_BUILD = '2026-10-17-stl-tooltip-focus';

window.ggelatoAPI = {
  build: GGELATO_API_BUILD,

  // hierarchy model
  TOTAL_KEY,
  TOTAL_COLOR,
  LEVEL_COLOR_STOPS,
  dataFrameToRows,
  isAggregatedValue,
  createDepthColors,
  parseStructure,
  isValidHierarchyOrder,
  requiredAncestors,
  escapeHtml,

  // hierarchy widget
  createHierarchyWidget,
  hierarchyConnectorPath,
  HIERARCHY_WIDGET_BUILD,

  // gig state
  createHierState,
  resolveGigStructure,
  resolveGigValue,
  resolveTimeColumn,
  compareTimeRows,
  timeSortValue,

  // gig selection
  getDescendantIndices,
  updateGigSelection,
  applyBrushSelection,
  createGigHierarchyAdapter,
  attachBrushGesture,
  createBrushOverlay,
  pointInBox,
  pointInPolygon,

  // renderers
  renderSunburst,
  renderPoint,
  renderStldp
};
