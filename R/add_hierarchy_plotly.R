#' Add an interactive hierarchy widget to a plotly plot
#'
#' Adds a draggable, resizable hierarchy widget to a line plot of a
#' hierarchical or grouped time series made with [plotly::ggplotly()]. Levels
#' can be reordered by dragging and toggled by clicking, and the traces are
#' restyled accordingly.
#'
#' Each trace must identify its series through its hover text, in the form
#' `"State: Tasmania<br>Region: Hobart and the South<br>Purpose: Holiday"`,
#' with `<aggregated>` for aggregated levels.
#'
#' @param plot A plotly htmlwidget returned by [plotly::ggplotly()].
#' @param structure Aggregation structure as a string, such as
#'   `"(State/Region)*Purpose"`.
#' @param width,height Output size (any valid CSS unit). When omitted, the
#'   original plotly dimensions and sizing policy are kept.
#'
#' @return The plotly htmlwidget with the hierarchy widget attached.
#'
#' @examplesIf requireNamespace("plotly", quietly = TRUE) && requireNamespace("fabletools", quietly = TRUE)
#' library(ggplot2)
#'
#' tas_hts <- fabletools::aggregate_key(
#'   aus_tourism[aus_tourism$State == "Tasmania", ],
#'   (State / Region) * Purpose, Trips = sum(Trips)
#' )
#' tas_hts$series <- paste0(
#'   "State: ", tas_hts$State, "<br>Region: ", tas_hts$Region,
#'   "<br>Purpose: ", tas_hts$Purpose
#' )
#'
#' tas_plot <- ggplot(as.data.frame(tas_hts),
#'                    aes(x = as.Date(Quarter), y = Trips,
#'                        group = series, text = series)) +
#'   geom_line()
#' add_hierarchy_plotly(plotly::ggplotly(tas_plot, tooltip = "text"),
#'                      "(State/Region)*Purpose")
#'
#' @seealso [add_hierarchy_hc()]
#' @export
add_hierarchy_plotly <- function(plot, structure, width = NULL, height = NULL) {
  if (!inherits(plot, "htmlwidget")) {
    stop("`plot` must be a plotly htmlwidget.", call. = FALSE)
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
