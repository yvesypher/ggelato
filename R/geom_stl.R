#' STL decomposition layer
#'
#'
#' @param mapping Mapping
#' @param scaled For scaled data
#' @param width,height Optional explicit widget size (any valid CSS unit).
#' @param elementId Optional element id.
#'
#' @return A `gig_layer`.
#'
#' @examples
#' \dontrun{
#' gig(stl_cmp, gig_aes(x = Quarter, y = Trips, season = season_year)) +
#'   geom_stl() +
#'   hierarchy((State / Region) * Purpose)
#' }
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

#' Shiny bindings for a gig_stl plot
#'
#' @param outputId output variable to read from
#' @param width,height Must be a valid CSS unit or a number
#' @param expr An expression that generates a `gig() + geom_stl()` widget
#' @param env The environment in which to evaluate `expr`
#' @param quoted Is `expr` a quoted expression?
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
