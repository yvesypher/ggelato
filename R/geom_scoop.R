#' Add an interactive drag-and-drop scoop legend to a ggplot
#' @export
geom_scoop <- function(structure) {
  # Store the user's formula (e.g., "(State/Region)*Purpose")
  obj <- list(structure = structure)

  # Change the class name to match our new scoop theme
  class(obj) <- c("ggelato_scoop", "gg")

  return(obj)
}

#' @export
ggplot_add.ggelato_scoop <- function(object, plot, object_name) {

  # 1. Extract the raw data from the ggplot object
  raw_data <- plot$data

  # 2. Extract the Aesthetics (x, y, fill)
  mapping <- plot$mapping
  y_var <- if(!is.null(mapping$y)) rlang::as_name(mapping$y) else NULL
  x_var <- if(!is.null(mapping$x)) rlang::as_name(mapping$x) else NULL
  fill_var <- if(!is.null(mapping$fill)) rlang::as_name(mapping$fill) else NULL

  # 3. Detect the Geom type
  geom_type <- class(plot$layers[[1]]$geom)[1]
  js_chart_type <- switch(geom_type,
                          "GeomBar" = "bar",
                          "GeomCol" = "bar",
                          "GeomPoint" = "scatter",
                          "GeomLine" = "line",
                          "bar" # Default fallback
  )

  # 4. Package it all into a clean list for your JS widget
  payload <- list(
    ft = raw_data,
    hierarchy = object$structure,
    aes = list(
      target = y_var,
      primary = x_var,
      color = fill_var
    ),
    chart_type = js_chart_type
  )

  # 5. Launch your packer htmlwidget!
  htmlwidgets::createWidget(
    name = 'linkvis', # Or 'scoopvis' if you rename the widget too!
    x = payload,
    package = 'ggelato',
    width = "100%",
    height = "100vh"
  )
}
