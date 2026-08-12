# Internal helpers shared by gig_point(), gig_stldp(), and gig_sunburst().

# Resolve a renamed public argument while keeping one release of source-level
# compatibility for callers using the former name.
resolve_gig_alias <- function(primary, legacy, primary_name, legacy_name) {
  if (!is.null(primary) && !is.null(legacy)) {
    stop(
      "Supply only `", primary_name, "` or its deprecated `", legacy_name,
      "` alias, not both.",
      call. = FALSE
    )
  }
  if (is.null(primary)) legacy else primary
}

# Coerce a data frame so it serialises cleanly to JavaScript. Numeric columns
# remain numeric; special vector classes (including agg_vec, factor,
# yearquarter, and yearmonth) become character columns.
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

# Resolve the index used by gig_stldp(). An explicit name wins; otherwise use
# a tsibble index, a recognised temporal class, or a conventional index name.
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
    "Could not infer the time column. Supply it explicitly, for example ",
    "`gig_stldp(data, time = \"timestamp\")`.",
    call. = FALSE
  )
}

# Preserve chronology before special index classes are formatted for JSON.
# Character indices are ordered in JavaScript, which can parse calendar,
# quarter, week, date-time and naturally numbered labels.
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

#' Create a gig_* htmlwidget with consistent sizing and dependencies
#' @noRd
create_gig_widget <- function(name, x, width, height, element_id) {
  htmlwidgets::createWidget(
    name = name,
    x = x,
    # NULL delegates sizing to htmlwidgets. In knitr/Quarto this uses the same
    # global or per-chunk figure dimensions as ordinary R plots.
    width = width,
    height = height,
    package = "ggelato",
    elementId = element_id,
    sizingPolicy = ggelato_sizing_policy(),
    # gig-styles.css and plotting libraries remain in each widget's existing
    # YAML binding; only the newly shared hierarchy stylesheet is attached
    # here.
    dependencies = list(ggelato_hierarchy_core_dependency())
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
