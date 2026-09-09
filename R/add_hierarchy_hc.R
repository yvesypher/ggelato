#' Add an interactive hierarchy widget to a Highcharts plot
#'
#' Add a draggable, resizable hierarchy tree on an existing highcharts
#' widget for hierarchical time series. Levels can be reordered by dragging
#' and toggled by clicking, and traces are restyled accordingly.
#'
#' @param plot A highchart/htmlwidget object.
#' @param structure Hierarchy structure, e.g. "(State/Region)*Purpose".
#' @param time_labels How to label a numeric x axis that holds day-numbers
#' @param width,height Output size (any valid CSS unit). When omitted, the
#'   original Highcharter dimensions and sizing policy are preserved. In
#'   QMD/RMD, the original widget follows the document's global or per-chunk
#'   figure options.
#' @return The plotly object with the hierarchy widget.
#' @export
add_hierarchy_hc <- function(plot, structure,
                             time_labels = c("auto", "quarter", "month",
                                             "year", "date", "none"),
                             width = NULL, height = NULL) {
  time_labels <- match.arg(time_labels)
  plot <- hierarchy_prepare_highchart(plot, structure, time_labels)
  plot <- ggelato_apply_widget_size(plot, width, height)
  plot <- highcharter::hc_chart(
    plot,
    backgroundColor = "#FFFFFF",
    plotBackgroundColor = "#FFFFFF"
  )

  ggelato_attach_hierarchy_addon(
    plot,
    addon_name = "add_hierarchy_hc",
    init_function = "init_hierarchy_hc",
    stylesheet = "add_hierarchy_hc.css"
  )
}
