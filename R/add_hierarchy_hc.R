#' Add an interactive hierarchy widget to a highcharter plot
#'
#' Adds a draggable, resizable hierarchy widget to an existing highcharter
#' line plot of a hierarchical or grouped time series. Levels can be reordered
#' by dragging and toggled by clicking, and the series are restyled
#' accordingly.
#'
#' The key columns named in `structure` must be kept in the data passed to
#' [highcharter::hc_add_series()], so that every series can be matched to its
#' position in the hierarchy.
#'
#' @param plot A highcharter htmlwidget.
#' @param structure Aggregation structure as a string, such as
#'   `"(State/Region)*Purpose"`.
#' @param time_labels How to label a numeric x axis holding day numbers.
#'   `"auto"` detects quarterly, monthly, yearly or daily spacing.
#' @param width,height Output size (any valid CSS unit). When omitted, the
#'   original highcharter dimensions and sizing policy are kept.
#'
#' @return The highcharter htmlwidget with the hierarchy widget attached.
#'
#' @examplesIf requireNamespace("fabletools", quietly = TRUE)
#' library(highcharter)
#'
#' tas_hts <- fabletools::aggregate_key(
#'   aus_tourism[aus_tourism$State == "Tasmania", ],
#'   (State / Region) * Purpose,
#'   Trips = sum(Trips)
#' )
#' tas_hts <- data.frame(
#'   Quarter = as.numeric(as.Date(tas_hts$Quarter)),
#'   State = as.character(tas_hts$State),
#'   Region = as.character(tas_hts$Region),
#'   Purpose = as.character(tas_hts$Purpose),
#'   Trips = tas_hts$Trips
#' )
#'
#' tas_plot <- highchart() |>
#'   hc_add_series(
#'     tas_hts,
#'     type = "line",
#'     hcaes(x = Quarter, y = Trips, group = interaction(State, Region, Purpose))
#'   )
#' add_hierarchy_hc(tas_plot, "(State/Region)*Purpose")
#'
#' @seealso [add_hierarchy_plotly()]
#' @export
add_hierarchy_hc <- function(plot, structure,
                             time_labels = c(
                               "auto", "quarter", "month",
                               "year", "date", "none"
                             ),
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
