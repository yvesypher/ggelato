#' Interactive sunburst (radial partition) plot with a hierarchy widget
#'
#' Draws the hierarchical key structure of the data as a sunburst: the
#' root ("Total") at the centre and one ring per hierarchy level, with
#' the full interactive chrome shared with [gig_stldp()]:
#'
#' * **Hierarchy widget** (shown by default): a floating card of draggable
#'   chips led by a Total chip. Drag chips to reorder the nesting (the
#'   sunburst re-partitions accordingly); moves that violate a nesting
#'   constraint declared in `structure` are rejected with a shake; click
#'   a chip to collapse that level. Hovering a chip opens an Excel-style
#'   dropdown (search box, tri-state "(Select All)") where checkboxes
#'   highlight that level's segments (checkbox colour matches the chip)
#'   and eye buttons hide/unhide values - hiding re-partitions the
#'   sunburst so the remaining segments expand to fit. The hierarchy widget
#'   can be dragged anywhere, resized (its content scales), and docked
#'   to any edge of the plot, which then resizes around it.
#' * **Toolbar** (docked left by default): selection mode (single /
#'   multiple / inverse / hierarchical), box selection, lasso selection,
#'   a label visibility toggle, and reset. Drag its handle to float it,
#'   or use the handle menu to dock it top, float it horizontally or
#'   vertically, or minimise it.
#' * **Plot interactions**: click segments to select (shift-click to
#'   add), scroll to zoom, drag to pan, hover for a tooltip.
#'
#' @param data A data frame whose hierarchy key columns are character
#'   columns using `"<aggregated>"` markers for aggregated levels, e.g.
#'   `as_tibble(aggregate_key(...))` from fabletools. Only the key
#'   columns are used; other columns (time, measures) are ignored, so
#'   you can pass the same data used for [gig_stldp()].
#' @param structure A string using fabletools-style hierarchical syntax,
#'   e.g. `"(State/Region)*Purpose"`. `/` declares nesting constraints
#'   (parent/child) enforced when chips are reordered; `*` crosses
#'   independent groups. If `NULL`, the key order is inferred from the
#'   data (columns with fewer `"<aggregated>"` rows are placed higher).
#' @param hierarchy Deprecated compatibility alias for `structure`.
#' @param labels Show segment labels initially (default `TRUE`). Can be
#'   toggled from the toolbar at any time.
#' @param width,height Optional explicit widget size (any valid CSS unit).
#'   When omitted, sizing follows the same htmlwidgets/knitr policy as an
#'   ordinary R plot, including global or per-chunk `fig-width`, `fig-height`,
#'   and `fig-asp` options.
#' @param elementId Optional element id.
#'
#' @examples
#' \dontrun{
#' library(fabletools)
#' library(tsibble)
#' library(dplyr)
#'
#' tourism_hts <- tourism |>
#'   aggregate_key((State / Region) * Purpose, Trips = sum(Trips))
#'
#' gig_sunburst(as_tibble(tourism_hts), structure = "(State/Region)*Purpose")
#'
#' # The same components data used for gig_stldp() works directly:
#' # gig_sunburst(stl_cmp, structure = "(State/Region)*Purpose")
#' }
#'
#' @seealso [gig_stldp()] for the matching STL decomposition plot.
#' @import htmlwidgets
#' @export
gig_sunburst <- function(data, structure = NULL, labels = TRUE,
                         width = NULL, height = NULL, elementId = NULL,
                         hierarchy = NULL) {

  structure <- resolve_gig_alias(
    structure, hierarchy, "structure", "hierarchy"
  )

  x <- list(
    data = prep_gig_data(data),
    structure = structure,
    labels = isTRUE(labels)
  )

  create_gig_widget(
    name = "gig_sunburst",
    x = x,
    width = width,
    height = height,
    element_id = elementId
  )
}

#' Shiny bindings for gig_sunburst
#'
#' Output and render functions for using gig_sunburst within Shiny
#' applications and interactive R Markdown documents.
#'
#' @param outputId output variable to read from
#' @param width,height Must be a valid CSS unit (like `"100%"`,
#'   `"400px"`) or a number, which will be coerced to a string and
#'   have `"px"` appended.
#' @param expr An expression that generates a gig_sunburst widget
#' @param env The environment in which to evaluate `expr`
#' @param quoted Is `expr` a quoted expression (with `quote()`)?
#'
#' @name gig_sunburst-shiny
#' @export
gig_sunburstOutput <- function(outputId, width = "100%", height = "400px") {
  gig_widget_output(outputId, "gig_sunburst", width, height)
}

#' @rdname gig_sunburst-shiny
#' @export
renderGig_sunburst <- function(expr, env = parent.frame(), quoted = FALSE) {
  render_gig_widget(expr, gig_sunburstOutput, env, quoted)
}
