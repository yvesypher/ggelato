# Internal helpers shared by the gig() grammar object model (gig.R,
# gig_aes.R, hierarchy.R) and the geom_*() constructors.

prep_gig_data <- function(data) {
  data <- as.data.frame(data)
  for (name in names(data)) {
    column <- data[[name]]
    if (!is.numeric(column) && !is.character(column)) {
      data[[name]] <- format(column)
    }
  }
  data
}

resolve_gig_time_column <- function(data, time = NULL, x = NULL) {
  if (!is.null(time) && !is.null(x)) {
    stop("Supply only one of `time` or `x`.", call. = FALSE)
  }
  requested <- time %||% x
  column_names <- names(data)

  if (!is.null(requested)) {
    if (!is.character(requested) || length(requested) != 1L ||
        is.na(requested) || !nzchar(requested)) {
      stop("`time` (or its `x` alias) must be one column name.", call. = FALSE)
    }
    if (!requested %in% column_names) {
      stop("Time column `", requested, "` was not found in `data`.",
           call. = FALSE)
    }
    return(requested)
  }

  if (inherits(data, "tbl_ts") && requireNamespace("tsibble", quietly = TRUE)) {
    index_name <- tryCatch(tsibble::index_var(data), error = function(...) NULL)
    if (is.character(index_name) && length(index_name) == 1L &&
        index_name %in% column_names) {
      return(index_name)
    }
  }

  temporal_classes <- c(
    "Date", "POSIXct", "POSIXlt", "yearquarter", "yearmonth", "yearweek",
    "yearmon", "yearqtr", "hms", "nanotime"
  )
  class_matches <- column_names[vapply(data, function(column) {
    any(vapply(
      temporal_classes,
      function(class_name) inherits(column, class_name),
      logical(1)
    ))
  }, logical(1))]
  if (length(class_matches)) return(class_matches[[1L]])

  conventional_names <- c(
    "time", "date", "datetime", "timestamp", "index", ".index", "year",
    "yearmonth", "year_month", "month", "yearquarter", "year_quarter",
    "quarter", "yearweek", "year_week", "week", "day", "hour", "minute",
    "second"
  )
  match_index <- match(tolower(conventional_names), tolower(column_names),
                       nomatch = 0L)
  match_index <- match_index[match_index > 0L]
  if (length(match_index)) return(column_names[[match_index[[1L]]]])

  stop(
    "Could not infer the time column. Supply it explicitly with ",
    "`gig_aes(x = timestamp)`.",
    call. = FALSE
  )
}

gig_time_order <- function(column) {
  ordered_class <- is.numeric(column) || is.factor(column) ||
    inherits(column, c(
      "Date", "POSIXt", "yearquarter", "yearmonth", "yearweek",
      "yearmon", "yearqtr", "hms", "nanotime"
    ))
  if (!ordered_class) return(rep(NA_real_, length(column)))
  transformed <- tryCatch(xtfrm(column), error = function(...) NULL)
  if (is.null(transformed)) return(rep(NA_real_, length(column)))
  as.numeric(transformed)
}

prep_gig_stldp_data <- function(data, time_column) {
  data <- as.data.frame(data)
  if (".ggelato_time_order" %in% names(data)) {
    stop("`.ggelato_time_order` is reserved for internal use.", call. = FALSE)
  }
  time_order <- gig_time_order(data[[time_column]])
  data <- prep_gig_data(data)
  data$.ggelato_time_order <- time_order
  data
}

#' Shared stylesheet dependency for native gig_* widgets
#' @noRd
ggelato_gig_styles_dependency <- function() {
  htmltools::htmlDependency(
    name = "gig-styles",
    version = ggelato_package_version(),
    package = "ggelato",
    src = "htmlwidgets",
    stylesheet = "assets/css/gig-styles.css",
    all_files = FALSE
  )
}

#' Create a gig_* htmlwidget with consistent sizing and dependencies
#' @noRd
create_gig_widget <- function(name, x, width, height, element_id) {
  htmlwidgets::createWidget(
    name = name,
    x = x,
    width = width,
    height = height,
    package = "ggelato",
    elementId = element_id,
    sizingPolicy = ggelato_sizing_policy(),
    dependencies = list(
      ggelato_gig_styles_dependency(),
      ggelato_hierarchy_core_dependency()
    )
  )
}

#' Shared Shiny output helper for gig_* widgets
#' @noRd
gig_widget_output <- function(output_id, widget_name,
                              width = "100%", height = "400px") {
  htmlwidgets::shinyWidgetOutput(
    output_id,
    widget_name,
    width,
    height,
    package = "ggelato"
  )
}

#' Shared Shiny render helper for gig_* widgets
#' @noRd
render_gig_widget <- function(expr, output_function, env, quoted) {
  if (!quoted) expr <- substitute(expr)
  htmlwidgets::shinyRenderWidget(expr, output_function, env, quoted = TRUE)
}
