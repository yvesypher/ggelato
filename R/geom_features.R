#' Feature-space scatter layer
#'
#' Draws each series as a point in feature space (e.g. trend strength vs
#' seasonal strength), where users can interact with the axis to change variables of time series features
#'
#' @param mapping Optional layer-level [gig_aes()] overriding the plot
#'   mapping.
#' @param width,height Optional explicit widget size (any valid CSS unit).
#'   When omitted, sizing follows the usual htmlwidgets/knitr policy.
#' @param elementId Optional element id.
#'
#' @return A `gig_layer`.
#'
#' @examples
#' \dontrun{
#' gig(tourism_ft, gig_aes(x = trend_strength, y = seasonal_strength_year)) +
#'   geom_features() +
#'   hierarchy((State / Region) * Purpose)
#' }
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

#' Shiny bindings for a gig_features plot
#'
#' The widget's registered class remains `gig_point` (unchanged JS binding
#' name)
#'
#' @param outputId output variable to read from
#' @param width,height Must be a valid CSS unit or a number
#' @param expr An expression that generates a `gig() + geom_features()` widget
#' @param env The environment in which to evaluate `expr`
#' @param quoted Is `expr` a quoted expression?
#'
#' @name geom_features-shiny
#' @export
geom_featuresOutput <- function(outputId, width = "100%", height = "400px") {
  gig_widget_output(outputId, "gig_point", width, height)
}

#' @rdname geom_features-shiny
#' @export
renderGeomFeatures <- function(expr, env = parent.frame(), quoted = FALSE) {
  render_gig_widget(expr, geom_featuresOutput, env, quoted)
}
