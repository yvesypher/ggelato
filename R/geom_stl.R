#' STL decomposition layer
#'
#' Draws the observed series together with its trend, seasonal and remainder
#' components from an STL decomposition. The `trend`, `seasonality` and
#' `remainder` aesthetics must be mapped explicitly in [gig_aes()].
#'
#' @param mapping Optional layer-level [gig_aes()] that overrides the plot
#'   mapping.
#' @param scaled Optional table of STL components computed from standardised
#'   series, with the same columns as the plot data. When supplied, the
#'   toolbar can switch between the original and the standardised scale.
#' @param width,height Optional widget size (any valid CSS unit).
#' @param elementId Optional element id.
#'
#' @return A `gig_layer`.
#'
#' @examplesIf requireNamespace("feasts", quietly = TRUE)
#' library(fabletools)
#' library(feasts)
#'
#' tas_tourism <- aus_tourism[aus_tourism$State == "Tasmania", ]
#' tas_stl <- tas_tourism |>
#'   aggregate_key((State / Region) * Purpose, Trips = sum(Trips)) |>
#'   model(stl = STL(Trips)) |>
#'   components()
#'
#' gig(tas_stl,
#'     gig_aes(x = Quarter, y = Trips, trend = trend,
#'             seasonality = season_year, remainder = remainder)) +
#'   geom_stl() +
#'   hierarchy((State / Region) * Purpose)
#'
#' @seealso [gig()]
#' @export
geom_stl <- function(mapping = NULL, scaled = NULL,
                     width = NULL, height = NULL, elementId = NULL) {
  new_gig_layer(
    "stl",
    mapping = mapping,
    params = list(
      scaled = scaled, width = width, height = height, elementId = elementId
    )
  )
}

#' Shiny bindings for geom_stl()
#'
#' Output and render functions for using a `gig() + geom_stl()` plot within
#' Shiny applications and interactive R Markdown documents.
#'
#' @inheritParams geom_features-shiny
#' @param expr An expression that generates a `gig() + geom_stl()` plot.
#'
#' @return `geom_stlOutput()` returns a Shiny output element and
#'   `renderGeomStl()` returns a Shiny render function.
#'
#' @name geom_stl-shiny
#' @export
geom_stlOutput <- function(outputId, width = "100%", height = "400px") {
  gig_widget_output(outputId, "gig_stldp", width, height)
}

#' @rdname geom_stl-shiny
#' @export
renderGeomStl <- function(expr, env = parent.frame(), quoted = FALSE) {
  render_gig_widget(expr, geom_stlOutput, env, quoted)
}
