#' Interactive scatterplot of time series features with a hierarchy widget
#'
#' Plots each series in a hierarchical collection as a point in feature
#' space (e.g. trend strength vs seasonal strength from
#' `feasts::feature_set()`), with the same interactive chrome as
#' [gig_stldp()] and [gig_sunburst()]:
#'
#' * **Axis dropdowns**: the x and y variables are chosen from the
#'   numeric feature columns via the dropdowns on the plot axes (the
#'   y-axis dropdown is rotated, as in linkvis); switching variables
#'   re-fits the axes.
#' * **Hierarchy widget** (shown by default): Total chip + draggable
#'   variable chips with nesting constraints from `structure`, chip
#'   collapse, and the hover dropdown per variable (search, tri-state
#'   Select All, chip-coloured highlight checkboxes, hide/unhide eyes -
#'   hiding removes points and re-fits the axes). Draggable, resizable
#'   (content scales) and dockable to any edge.
#' * **Toolbar**: selection modes (single / multiple / inverse with
#'   Peers Only and Entire Hierarchy variants / hierarchical), box and
#'   lasso selection, reset; dockable left/top, floatable, minimisable.
#' * **Plot interactions**: click points to select (shift-click adds),
#'   scroll to zoom, drag to pan (reset restores the auto-fit), hover
#'   for a tooltip with the series name and feature values.
#'
#' @param data A data frame of features, one row per series: the
#'   hierarchy key columns as character columns with `"<aggregated>"`
#'   markers plus numeric feature columns, e.g. the result of
#'   `features(Trips, feature_set(pkgs = "feasts"))` on an
#'   `aggregate_key()` tsibble.
#' @param structure A string using fabletools-style hierarchical syntax,
#'   e.g. `"(State/Region)*Purpose"`. If `NULL`, the order is inferred.
#' @param hierarchy Deprecated compatibility alias for `structure`.
#' @param xvar,yvar Optional names of the numeric feature columns shown
#'   initially on the x and y axes. Defaults to the first two numeric
#'   columns. Both can be changed interactively from the axis dropdowns.
#' @param width,height Optional explicit widget size (any valid CSS unit).
#'   When omitted, sizing follows the same htmlwidgets/knitr policy as an
#'   ordinary R plot, including global or per-chunk `fig-width`, `fig-height`,
#'   and `fig-asp` options. The scatterplot itself remains square.
#' @param elementId Optional element id.
#'
#' @examples
#' \dontrun{
#' library(fabletools)
#' library(feasts)
#' library(tsibble)
#' library(dplyr)
#'
#' tourism_ft <- tourism |>
#'   aggregate_key((State / Region) * Purpose, Trips = sum(Trips)) |>
#'   features(Trips, feature_set(pkgs = "feasts"))
#'
#' gig_point(tourism_ft, structure = "(State/Region)*Purpose",
#'           xvar = "trend_strength", yvar = "seasonal_strength_year")
#' }
#'
#' @seealso [gig_stldp()], [gig_sunburst()]
#' @import htmlwidgets
#' @export
gig_point <- function(data, structure = NULL, xvar = NULL, yvar = NULL,
                      width = NULL, height = NULL, elementId = NULL,
                      hierarchy = NULL) {

  structure <- resolve_gig_alias(
    structure, hierarchy, "structure", "hierarchy"
  )

  x <- list(
    data = prep_gig_data(data),
    structure = structure,
    xvar = xvar,
    yvar = yvar
  )

  create_gig_widget(
    name = "gig_point",
    x = x,
    width = width,
    height = height,
    element_id = elementId
  )
}

#' Shiny bindings for gig_point
#'
#' @param outputId output variable to read from
#' @param width,height Must be a valid CSS unit or a number
#' @param expr An expression that generates a gig_point widget
#' @param env The environment in which to evaluate `expr`
#' @param quoted Is `expr` a quoted expression?
#'
#' @name gig_point-shiny
#' @export
gig_pointOutput <- function(outputId, width = "100%", height = "400px") {
  gig_widget_output(outputId, "gig_point", width, height)
}

#' @rdname gig_point-shiny
#' @export
renderGig_point <- function(expr, env = parent.frame(), quoted = FALSE) {
  render_gig_widget(expr, gig_pointOutput, env, quoted)
}
