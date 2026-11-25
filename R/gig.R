#' Create a gig plot specification
#'
#' `gig()` starts a plot of a hierarchical or grouped time series. It holds the
#' data, the default aesthetic mapping and, optionally, the aggregation
#' structure. Components are then added with `+`:
#'
#' * one `geom_*()` layer, [geom_features()], [geom_stl()] or
#'   [geom_sunburst()];
#' * a [hierarchy()] specification, if it was not supplied through
#'   `structure`;
#' * a [gig_aes()] mapping, which is merged into the plot mapping.
#'
#' The plot is drawn when it is printed. Use [gig_build()] to obtain the
#' underlying htmlwidget, for example to save it with
#' [htmlwidgets::saveWidget()].
#'
#' @param data A data frame. For [geom_features()], one row per series
#'   containing the key columns and numeric feature columns. For
#'   [geom_stl()], a table of STL components. For [geom_sunburst()], any
#'   table containing the key columns.
#' @param mapping A [gig_aes()] mapping. Layers may override it.
#' @param structure Optional aggregation structure. Either a bare expression
#'   such as `(State / Region) * Purpose`, a string such as
#'   `"(State/Region)*Purpose"`, or a [hierarchy()] object. Adding
#'   `+ hierarchy(...)` afterwards overrides it.
#'
#' @return An object of class `gig`.
#'
#' @examplesIf requireNamespace("feasts", quietly = TRUE)
#' library(fabletools)
#' library(feasts)
#'
#' tas_tourism <- aus_tourism[aus_tourism$State == "Tasmania", ]
#' tas_features <- tas_tourism |>
#'   aggregate_key((State / Region) * Purpose, Trips = sum(Trips)) |>
#'   features(Trips, feat_stl)
#'
#' gig(tas_features,
#'     gig_aes(x = trend_strength, y = seasonal_strength_year),
#'     structure = (State / Region) * Purpose) +
#'   geom_features()
#'
#' @seealso [gig_aes()], [hierarchy()], [gig_build()]
#' @export
gig <- function(data, mapping = gig_aes(), structure = NULL) {
  if (missing(data) || is.null(data)) {
    stop("`data` is required.", call. = FALSE)
  }
  if (!is.data.frame(data)) {
    data <- tryCatch(
      as.data.frame(data),
      error = function(...) {
        stop("`data` must be a data frame or coercible to one.", call. = FALSE)
      }
    )
  }
  if (!is_gig_aes(mapping)) {
    stop("`mapping` must be created with gig_aes().", call. = FALSE)
  }

  structure_quo <- rlang::enquo(structure)
  initial_hierarchy <- if (rlang::quo_is_null(structure_quo)) {
    NULL
  } else {
    new_gig_hierarchy_from_quo(structure_quo)
  }

  base::structure(
    list(
      data = data,
      mapping = mapping,
      layers = list(),
      hierarchy = initial_hierarchy
    ),
    class = "gig"
  )
}

#' Is this object a gig plot specification?
#'
#' @param x An object.
#' @return `TRUE` or `FALSE`.
#' @examples
#' is_gig(gig(aus_tourism))
#' @export
is_gig <- function(x) inherits(x, "gig")

#' Add a component to a gig plot
#'
#' @param e1 A `gig` plot.
#' @param e2 A `gig_layer`, `gig_hierarchy` or `gig_aes`, or a list of these.
#' @return The updated `gig` plot.
#' @export
"+.gig" <- function(e1, e2) {
  if (!is_gig(e1)) {
    stop("The left-hand side of `+` must be a <gig> plot.", call. = FALSE)
  }

  if (is_gig_layer(e2)) {
    e1$layers <- c(e1$layers, list(e2))
  } else if (is_gig_hierarchy(e2)) {
    e1$hierarchy <- e2
  } else if (is_gig_aes(e2)) {
    e1$mapping <- merge_gig_aes(e1$mapping, e2)
  } else if (is.list(e2) && !is.data.frame(e2) &&
             all(vapply(e2, function(item) {
               is_gig_layer(item) || is_gig_hierarchy(item) || is_gig_aes(item)
             }, logical(1)))) {
    # A list of components, so `p + list(geom_features(), h)` works.
    for (item in e2) e1 <- e1 + item
  } else {
    stop(
      "Don't know how to add a <", class(e2)[[1L]], "> to a <gig> plot. ",
      "Expected geom_features()/geom_stl()/geom_sunburst(), hierarchy() ",
      "or gig_aes().",
      call. = FALSE
    )
  }

  e1
}

#' @export
print.gig <- function(x, ...) {
  print(gig_build(x))
  invisible(x)
}

#' @export
plot.gig <- function(x, ...) print.gig(x, ...)

# Shiny and knitr both look at the object, not print(), so route them to the
# built widget explicitly.
#' @rawNamespace S3method(knitr::knit_print, gig)
knit_print.gig <- function(x, ...) {
  knitr::knit_print(gig_build(x), ...)
}

#' Build a gig plot into an htmlwidget
#'
#' Printing a `gig` plot builds it automatically. Call `gig_build()` directly
#' to obtain the htmlwidget, for example to save it with
#' [htmlwidgets::saveWidget()] or to pass it to another function that expects
#' an htmlwidget.
#'
#' @param x A `gig` plot specification.
#' @return An htmlwidget of class `gig_point`, `gig_stldp` or `gig_sunburst`,
#'   depending on the geom layer.
#'
#' @examplesIf requireNamespace("fabletools", quietly = TRUE)
#' tas_hts <- fabletools::aggregate_key(
#'   aus_tourism[aus_tourism$State == "Tasmania", ],
#'   (State / Region) * Purpose, Trips = sum(Trips)
#' )
#'
#' plot_spec <- gig(tas_hts, structure = (State / Region) * Purpose) +
#'   geom_sunburst()
#' widget <- gig_build(plot_spec)
#' class(widget)
#'
#' @seealso [gig()]
#' @export
gig_build <- function(x) {
  if (!is_gig(x)) {
    stop("`x` must be a <gig> plot specification.", call. = FALSE)
  }
  if (length(x$layers) == 0L) {
    stop(
      "Add a geom layer before drawing, e.g. `gig(data) + geom_features()`.",
      call. = FALSE
    )
  }
  if (length(x$layers) > 1L) {
    stop(
      "Only one geom (geom_features()/geom_stl()/geom_sunburst()) is supported per plot; ",
      length(x$layers), " were supplied. ",
      "To show several views together, build each plot separately and ",
      "compose them with fridge::fridge().",
      call. = FALSE
    )
  }

  layer <- x$layers[[1L]]
  structure_string <- gig_hierarchy_string(x$hierarchy)

  switch(
    layer$geom,
    features = build_gig_features(x, layer, structure_string),
    stl      = build_gig_stl(x, layer, structure_string),
    sunburst = build_gig_sunburst(x, layer, structure_string),
    stop("Unknown gig geom: '", layer$geom, "'.", call. = FALSE)
  )
}

# Resolve the effective mapping for a layer against the plot data.
gig_layer_columns <- function(x, layer) {
  mapping <- merge_gig_aes(x$mapping, layer$mapping)
  resolve_gig_aes(mapping, x$data)
}

# --- features ---------------------------------------------------------------

build_gig_features <- function(x, layer, structure_string) {
  resolved <- gig_layer_columns(x, layer)

  widget_x <- list(
    data = prep_gig_data(resolved$data),
    structure = structure_string,
    xvar = resolved$columns$x,
    yvar = resolved$columns$y
  )

  create_gig_widget(
    name = "gig_point",
    x = widget_x,
    width = layer$params$width,
    height = layer$params$height,
    element_id = layer$params$elementId
  )
}

# --- stl ---------------------------------------------------------------------

build_gig_stl <- function(x, layer, structure_string) {
  resolved <- gig_layer_columns(x, layer)
  columns <- resolved$columns

  required <- c("seasonality", "trend", "remainder")
  missing <- required[vapply(required, function(name) is.null(columns[[name]]), logical(1))]
  if (length(missing)) {
    stop(
      "geom_stl() requires `", paste(missing, collapse = "`, `"), "` to be ",
      "explicitly mapped via gig_aes() - it does not guess these from ",
      "column names. For example: `gig_aes(trend = trend, ",
      "seasonality = season_year, remainder = remainder)`.",
      call. = FALSE
    )
  }

  time_column <- resolve_gig_time_column(resolved$data, time = columns$x)

  scaled_data <- layer$params$scaled
  if (!is.null(scaled_data)) {
    scaled_data <- as.data.frame(scaled_data)
    if (!time_column %in% names(scaled_data)) {
      stop("Time column `", time_column, "` was not found in `scaled`.",
           call. = FALSE)
    }
  }

  widget_x <- list(
    data = prep_gig_stldp_data(resolved$data, time_column),
    scaled = if (!is.null(scaled_data)) {
      prep_gig_stldp_data(scaled_data, time_column)
    },
    structure = structure_string,
    value = columns$y,
    season = columns$seasonality,
    trend = columns$trend,
    remainder = columns$remainder,
    time = time_column
  )

  create_gig_widget(
    name = "gig_stldp",
    x = widget_x,
    width = layer$params$width,
    height = layer$params$height,
    element_id = layer$params$elementId
  )
}

# --- sunburst ---------------------------------------------------------------

build_gig_sunburst <- function(x, layer, structure_string) {
  if (is.null(structure_string) || !nzchar(structure_string)) {
    stop(
      "geom_sunburst() requires an aggregation structure. Supply it with ",
      "`gig(data, structure = ...)` or `+ hierarchy(...)`.",
      call. = FALSE
    )
  }

  resolved <- gig_layer_columns(x, layer)

  widget_x <- list(
    data = prep_gig_data(resolved$data),
    structure = structure_string,
    labels = isTRUE(layer$params$labels)
  )

  create_gig_widget(
    name = "gig_sunburst",
    x = widget_x,
    width = layer$params$width,
    height = layer$params$height,
    element_id = layer$params$elementId
  )
}
