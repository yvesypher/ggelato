#' Interactive STL decomposition plot with a hierarchy widget
#'
#' Draws linked Data / Trend / Seasonality / Remainder panels for every
#' series in a hierarchical (and/or grouped) collection of STL
#' decompositions. A hierarchy legend of draggable chips is shown by
#' default: dragging a chip reorders the nesting (the plot re-nests and
#' redraws accordingly), clicking a chip collapses that level, and moves
#' that would violate a nesting constraint declared in `structure`
#' (e.g. putting `Region` above `State` in `"(State/Region)*Purpose"`)
#' are rejected with a shake animation.
#'
#' @param data A data frame (e.g. `as_tibble(components(...))` from
#'   fabletools) containing: the hierarchy key columns as character
#'   columns with `"<aggregated>"` markers, a time/index column, and numeric
#'   columns for the response, `trend`, a `season_*` column and `remainder`.
#' @param structure A string using fabletools-style hierarchical syntax,
#'   e.g. `"(State/Region)*Purpose"`. `/` declares nesting constraints
#'   (parent/child), `*` crosses independent groups. If `NULL`, the key
#'   order is inferred from the data (columns with fewer
#'   `"<aggregated>"` rows are placed higher).
#' @param value Name of the response/value column (e.g. `"Trips"`). If
#'   `NULL`, the first numeric column that is not `trend`, `remainder`,
#'   `season_adjust` or a `season_*` column is used.
#' @param hierarchy Deprecated compatibility alias for `structure`.
#' @param target Deprecated compatibility alias for `value`.
#' @param season Name of the seasonal component column. If `NULL`, the
#'   first column starting with `"season"` is used.
#' @param scaled Optional second data frame with the same structure as
#'   `data` but containing the decomposition of the *scaled* series
#'   (e.g. each series standardised before STL). When supplied, the
#'   toolbar shows a Scaled/Original toggle switch (as in linkvis) and
#'   the plot opens in the Scaled view; the axes re-fit automatically
#'   when the switch is flipped. When `NULL` (default), only `data` is
#'   shown and the switch is hidden.
#' @param time Name of the time/index column. Date, POSIXct, tsibble indexes,
#'   numeric indexes, ordered factors, and character labels representing
#'   yearly, quarterly, monthly, weekly, daily or sub-daily observations are
#'   supported. If `NULL`, a tsibble index, temporal class or conventional
#'   name such as `time`, `date`, `year`, `quarter` or `hour` is inferred.
#' @param x Alias for `time`. Supply only one of `time` and `x`.
#' @param width,height Optional explicit widget size (any valid CSS unit).
#'   When omitted, sizing follows the same htmlwidgets/knitr policy as an
#'   ordinary R plot, including global or per-chunk `fig-width`, `fig-height`,
#'   and `fig-asp` options.
#' @param elementId Optional element id.
#'
#' @examples
#' \dontrun{
#' library(fable)
#' library(fabletools)
#' library(feasts)
#' library(tsibble)
#' library(dplyr)
#'
#' tourism_hts <- tourism |>
#'   aggregate_key((State / Region) * Purpose, Trips = sum(Trips))
#'
#' stl_cmp <- tourism_hts |>
#'   model(stl = STL(Trips)) |>
#'   components() |>
#'   as_tibble()
#'
#' gig_stldp(stl_cmp, structure = "(State/Region)*Purpose", value = "Trips",
#'           time = "Quarter")
#'
#' # With a Scaled/Original toggle: decompose the standardised series too
#' stl_cmp_scaled <- tourism_hts |>
#'   tsibble::group_by_key() |>
#'   dplyr::mutate(Trips = as.numeric(scale(Trips))) |>
#'   dplyr::ungroup() |>
#'   model(stl = STL(Trips)) |>
#'   components() |>
#'   as_tibble()
#'
#' gig_stldp(stl_cmp, scaled = stl_cmp_scaled,
#'           structure = "(State/Region)*Purpose", value = "Trips")
#' }
#'
#' @import htmlwidgets
#' @export
gig_stldp <- function(data, structure = NULL, value = NULL, season = NULL,
                      scaled = NULL,
                      width = NULL, height = NULL, elementId = NULL,
                      time = NULL, x = NULL,
                      hierarchy = NULL, target = NULL) {

  structure <- resolve_gig_alias(
    structure, hierarchy, "structure", "hierarchy"
  )
  value <- resolve_gig_alias(value, target, "value", "target")

  time_column <- resolve_gig_time_column(data, time = time, x = x)
  if (!is.null(scaled) && !time_column %in% names(scaled)) {
    stop("Time column `", time_column, "` was not found in `scaled`.",
         call. = FALSE)
  }

  widget_data <- list(
    data = prep_gig_stldp_data(data, time_column),
    scaled = if (!is.null(scaled)) {
      prep_gig_stldp_data(scaled, time_column)
    },
    structure = structure,
    value = value,
    season = season,
    time = time_column
  )

  create_gig_widget(
    name = "gig_stldp",
    x = widget_data,
    width = width,
    height = height,
    element_id = elementId
  )
}

#' Shiny bindings for gig_stldp
#'
#' @param outputId output variable to read from
#' @param width,height Must be a valid CSS unit or a number
#' @param expr An expression that generates a gig_stldp widget
#' @param env The environment in which to evaluate `expr`
#' @param quoted Is `expr` a quoted expression?
#'
#' @name gig_stldp-shiny
#' @export
gig_stldpOutput <- function(outputId, width = "100%", height = "400px") {
  gig_widget_output(outputId, "gig_stldp", width, height)
}

#' @rdname gig_stldp-shiny
#' @export
renderGig_stldp <- function(expr, env = parent.frame(), quoted = FALSE) {
  render_gig_widget(expr, gig_stldpOutput, env, quoted)
}
