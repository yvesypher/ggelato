#' Add an interactive hierarchy widget to a Plotly plot
#'
#' Add a draggable, resizable hierarchy tree on an existing plotly
#' widget for hierarchical time series. Levels can be reordered by dragging
#' and toggled by clicking, and traces are restyled accordingly.
#'
#' @param plot A plotly object to which the hierarchy will be added.
#' @param structure Hierarchy structure, e.g. "(State/Region)*Purpose".
#' @param width,height Output size (any valid CSS unit). When omitted, the
#'   original Plotly dimensions and sizing policy are preserved. In QMD/RMD,
#'   the original widget follows the document's global or per-chunk figure
#'   options.
#' @return The plotly object with the hierarchy widget.
#' @export
add_hierarchy_plotly <- function(plot, structure, width = NULL, height = NULL) {
  if (!inherits(plot, "htmlwidget")) {
    stop("`plot` must be a plotly/htmlwidget object.", call. = FALSE)
  }
  hierarchy_validate_structure(structure)
  plot$x$hierarchy_structure <- structure

  plot$x$layout$showlegend <- FALSE
  plot <- ggelato_apply_widget_size(plot, width, height)

  ggelato_attach_hierarchy_addon(
    plot,
    addon_name = "add_hierarchy_plotly",
    init_function = "init_hierarchy"
  )
}
