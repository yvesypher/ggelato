#' Add an Interactive Hierarchy Panel to a Plotly Plot
#'
#' @param plot A plotly object to which the hierarchy will be added.
#' @param structure A string defining the hierarchy structure
#' @return The plotly object with the hierarchy add-on attached.
#' @export
add_hierarchy <- function(plot, structure) {
  plot$x$hierarchy_structure <- structure

  plot$x$layout$showlegend <- FALSE

  attach_hierarchy_addon(plot, "add_hierarchy", "init_hierarchy")
}
