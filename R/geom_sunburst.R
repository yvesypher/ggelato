#' Sunburst layer
#'
#' Draws the aggregation structure as a sunburst, in which each ring is one
#' level of the hierarchy. The data should contain the aggregated series as
#' well as the bottom-level series, as returned by
#' [fabletools::aggregate_key()] or by [fabletools::features()] applied to its
#' result. A sunburst requires an aggregation structure, supplied through
#' `gig(structure = )` or `+ hierarchy()`.
#'
#' @param mapping Optional layer-level [gig_aes()]. Accepted for consistency
#'   with the other layers; the sunburst does not use any aesthetic.
#' @param labels Show segment labels initially (default `TRUE`). Labels can
#'   also be toggled from the toolbar.
#' @param width,height Optional widget size (any valid CSS unit).
#' @param elementId Optional element id.
#'
#' @return A `gig_layer`.
#'
#' @examplesIf requireNamespace("fabletools", quietly = TRUE)
#' tas_hts <- fabletools::aggregate_key(
#'   aus_tourism[aus_tourism$State == "Tasmania", ],
#'   (State / Region) * Purpose, Trips = sum(Trips)
#' )
#'
#' gig(tas_hts) +
#'   geom_sunburst() +
#'   hierarchy((State / Region) * Purpose)
#'
#' @seealso [gig()]
#' @export
geom_sunburst <- function(mapping = NULL, labels = TRUE,
                          width = NULL, height = NULL, elementId = NULL) {
  new_gig_layer(
    "sunburst",
    mapping = mapping,
    params = list(
      labels = isTRUE(labels), width = width, height = height,
      elementId = elementId
    )
  )
}

#' Shiny bindings for geom_sunburst()
#'
#' Output and render functions for using a `gig() + geom_sunburst()` plot
#' within Shiny applications and interactive R Markdown documents.
#'
#' @inheritParams geom_features-shiny
#' @param expr An expression that generates a `gig() + geom_sunburst()` plot.
#'
#' @return `geom_sunburstOutput()` returns a Shiny output element and
#'   `renderGeomSunburst()` returns a Shiny render function.
#'
#' @name geom_sunburst-shiny
#' @export
geom_sunburstOutput <- function(outputId, width = "100%", height = "400px") {
  gig_widget_output(outputId, "gig_sunburst", width, height)
}

#' @rdname geom_sunburst-shiny
#' @export
renderGeomSunburst <- function(expr, env = parent.frame(), quoted = FALSE) {
  render_gig_widget(expr, geom_sunburstOutput, env, quoted)
}
