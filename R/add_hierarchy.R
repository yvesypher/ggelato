#' Add an Interactive Hierarchy Panel to a Plotly Plot
#'
#' Overlays a draggable, resizable hierarchy tree on an existing plotly
#' widget for hierarchical time series. Levels can be reordered by dragging
#' and toggled by clicking, and traces are restyled accordingly.
#'
#' @param plot A plotly object to which the hierarchy will be added.
#' @param structure A string defining the hierarchy structure
#'   (e.g., `"(State/Region)*Purpose"`), where `/` denotes parent/child
#'   and `*` denotes crossed groupings.
#' @return The plotly object with the hierarchy add-on attached.
#' @export
add_hierarchy <- function(plot, structure) {
  plot$x$hierarchy_structure <- structure

  # The chip panel replaces the legend; a per-series legend would also make
  # plotly auto-expand the right margin, leaving a wide gap next to a
  # docked panel.
  plot$x$layout$showlegend <- FALSE

  attach_hierarchy_addon(plot, "add_hierarchy", "init_hierarchy")
}
