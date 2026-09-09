#' Sunburst layer
#'
#' Draws the hierarchical structure as a sunburst
#'
#' @param mapping Optional layer-level [gig_aes()] overriding the plot
#'   mapping. Not currently read by the renderer.
#' @param labels Show segment labels initially (default `TRUE`). Can be
#'   toggled from the toolbar.
#' @param width,height Optional explicit widget size (any valid CSS unit).
#' @param elementId Optional element id.
#'
#' @return A `gig_layer`.
#'
#' @examples
#' \dontrun{
#' gig(tourism_tbl) +
#'   geom_sunburst() +
#'   hierarchy((State / Region) * Purpose)
#' }
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

#' Shiny bindings for a gig_sunburst plot
#'
#' @param outputId output variable to read from
#' @param width,height Must be a valid CSS unit or a number
#' @param expr An expression that generates a `gig() + geom_sunburst()` widget
#' @param env The environment in which to evaluate `expr`
#' @param quoted Is `expr` a quoted expression?
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
