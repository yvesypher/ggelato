#' Feature-space scatter layer
#'
#' Draws each series as a point in a two-dimensional feature space, such as
#' trend strength against seasonal strength. The variables on either axis can
#' be changed interactively to any other numeric column of `data`.
#'
#' @param mapping Optional layer-level [gig_aes()] that overrides the plot
#'   mapping. `x` and `y` give the initial feature columns.
#' @param width,height Optional widget size (any valid CSS unit). When
#'   omitted, sizing follows the htmlwidgets and knitr defaults.
#' @param elementId Optional element id.
#'
#' @return A `gig_layer`.
#'
#' @examplesIf requireNamespace("feasts", quietly = TRUE)
#' library(fabletools)
#' library(feasts)
#'
#' tas_tourism <- aus_tourism[aus_tourism$State == "Tasmania", ]
#' tas_features <- tas_tourism |>
#'   aggregate_key((State / Region) * Purpose, Trips = sum(Trips)) |>
#'   features(Trips, feat_stl)
#'
#' gig(tas_features, gig_aes(x = trend_strength, y = seasonal_strength_year)) +
#'   geom_features() +
#'   hierarchy((State / Region) * Purpose)
#'
#' @seealso [gig()]
#' @export
geom_features <- function(mapping = NULL, width = NULL, height = NULL,
                          elementId = NULL) {
  new_gig_layer(
    "features",
    mapping = mapping,
    params = list(width = width, height = height, elementId = elementId)
  )
}

#' Shiny bindings for geom_features()
#'
#' Output and render functions for using a `gig() + geom_features()` plot
#' within Shiny applications and interactive R Markdown documents.
#'
#' @param outputId Output variable to read from.
#' @param width,height A valid CSS unit (such as `"100%"` or `"400px"`) or a
#'   number, which is coerced to a string and has `"px"` appended.
#' @param expr An expression that generates a `gig() + geom_features()` plot.
#' @param env The environment in which to evaluate `expr`.
#' @param quoted Is `expr` a quoted expression (with [quote()])?
#'
#' @return `geom_featuresOutput()` returns a Shiny output element and
#'   `renderGeomFeatures()` returns a Shiny render function.
#'
#' @examplesIf interactive() && requireNamespace("feasts", quietly = TRUE)
#' library(shiny)
#' library(fabletools)
#' library(feasts)
#'
#' tas_hts <- aggregate_key(
#'   aus_tourism[aus_tourism$State == "Tasmania", ],
#'   (State / Region) * Purpose, Trips = sum(Trips)
#' )
#' tas_features <- features(tas_hts, Trips, feat_stl)
#'
#' ui <- fluidPage(geom_featuresOutput("features", height = "600px"))
#' server <- function(input, output, session) {
#'   output$features <- renderGeomFeatures(
#'     gig(tas_features,
#'         gig_aes(x = trend_strength, y = seasonal_strength_year)) +
#'       geom_features() +
#'       hierarchy((State / Region) * Purpose)
#'   )
#' }
#' shinyApp(ui, server)
#'
#' @name geom_features-shiny
#' @export
geom_featuresOutput <- function(outputId, width = "100%", height = "400px") {
  gig_widget_output(outputId, "gig_point", width, height)
}

#' @rdname geom_features-shiny
#' @export
renderGeomFeatures <- function(expr, env = parent.frame(), quoted = FALSE) {
  if (!quoted) expr <- substitute(expr)
  render_gig_widget(expr, geom_featuresOutput, env)
}
