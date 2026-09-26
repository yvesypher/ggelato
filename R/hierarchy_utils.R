# Internal helpers shared by add_hierarchy_hc(), add_hierarchy_plotly(), and
# the hierarchy widget embedded in the gig_* widgets.

`%||%` <- function(x, y) if (is.null(x)) y else x

ggelato_package_version <- function() {
  tryCatch(
    as.character(utils::packageVersion("ggelato")),
    error = function(...) "0.0.0"
  )
}

ggelato_hierarchy_asset_version <- function() {
  ggelato_package_version()
}

#' Plot sizing policy shared by the native gig_* widgets
#' @noRd
ggelato_sizing_policy <- function() {
  htmlwidgets::sizingPolicy(
    padding = 0,
    viewer.padding = 0,
    viewer.fill = TRUE,
    browser.padding = 0,
    browser.fill = TRUE,
    knitr.figure = TRUE
  )
}

#' Apply explicit size overrides without replacing an existing plot policy
#' @noRd
ggelato_apply_widget_size <- function(plot, width = NULL, height = NULL) {
  # Plotly and Highcharter already carry their own sizing policies. Preserve
  # those policies and their existing dimensions unless the caller requests
  # an explicit override.
  if (!is.null(width)) plot$width <- width
  if (!is.null(height)) plot$height <- height
  plot
}

hierarchy_validate_structure <- function(structure) {
  if (!is.character(structure) || length(structure) != 1L ||
      is.na(structure) || !nzchar(trimws(structure))) {
    stop("`structure` must be a non-empty character string.", call. = FALSE)
  }
  invisible(structure)
}

hierarchy_structure_keys <- function(structure) {
  hierarchy_validate_structure(structure)
  unique(unlist(regmatches(
    structure,
    gregexpr("[A-Za-z][A-Za-z0-9_.]*", structure)
  )))
}

hierarchy_is_aggregated <- function(value) {
  if (is.null(value) || length(value) != 1L) return(TRUE)
  value <- trimws(as.character(value))
  is.na(value) || !nzchar(value) ||
    tolower(value) %in% c(
      "na", "nan", "n/a", "null", "undefined", "all", "total",
      "aggregate", "aggregated", "<aggregated>"
    ) || grepl("aggregated", value, ignore.case = TRUE)
}

hierarchy_clean_value <- function(value) {
  if (hierarchy_is_aggregated(value)) "<aggregated>" else as.character(value)
}

hierarchy_readable_name <- function(hierarchy) {
  paste(names(hierarchy), unlist(hierarchy), sep = ": ", collapse = "; ")
}

hierarchy_parse_interaction_name <- function(series_name, keys) {
  if (is.null(series_name) || length(series_name) != 1L ||
      is.na(series_name)) {
    return(NULL)
  }

  series_name <- trimws(as.character(series_name))
  if (!nzchar(series_name)) return(NULL)

  keyed <- stats::setNames(vector("list", length(keys)), keys)
  for (key in keys) {
    escaped_key <- gsub(".", "\\\\.", key, fixed = TRUE)
    match <- regexec(
      paste0(
        "(?:^|[;,|])\\s*", escaped_key,
        "\\s*[:=]\\s*([^;,|]+)"
      ),
      series_name,
      ignore.case = TRUE,
      perl = TRUE
    )
    value <- regmatches(series_name, match)[[1]]
    if (length(value) >= 2L) {
      keyed[[key]] <- hierarchy_clean_value(trimws(value[[2]]))
    }
  }
  if (all(vapply(keyed, Negate(is.null), logical(1)))) return(keyed)

  separators <- c(".", "/", "|", " > ", " -> ", " \u203a ", " \u2192 ", " \u00bb ")
  for (separator in separators) {
    pieces <- trimws(strsplit(series_name, separator, fixed = TRUE)[[1]])
    pieces <- pieces[nzchar(pieces)]
    if (length(pieces) == length(keys)) {
      return(stats::setNames(
        as.list(vapply(
          pieces,
          hierarchy_clean_value,
          character(1),
          USE.NAMES = FALSE
        )),
        keys
      ))
    }
  }
  NULL
}

hierarchy_get_named_value <- function(object, key) {
  if (!is.list(object) || is.null(names(object))) return(NULL)
  index <- match(tolower(key), tolower(names(object)))
  if (is.na(index)) NULL else object[[index]]
}

hierarchy_from_object <- function(object, keys) {
  if (!is.list(object)) return(NULL)

  custom <- object$custom
  sources <- list(
    if (is.list(custom)) custom$hierarchy else NULL,
    object$hierarchy,
    custom,
    object
  )
  hierarchy <- stats::setNames(vector("list", length(keys)), keys)

  for (source in sources) {
    if (!is.list(source)) next
    for (key in keys) {
      if (!is.null(hierarchy[[key]])) next
      value <- hierarchy_get_named_value(source, key)
      if (!is.null(value) && length(value) == 1L) {
        hierarchy[[key]] <- hierarchy_clean_value(value)
      }
    }
  }

  if (all(vapply(hierarchy, Negate(is.null), logical(1)))) hierarchy else NULL
}

hierarchy_extract_series <- function(series, keys) {
  hierarchy <- hierarchy_from_object(series, keys)
  if (!is.null(hierarchy)) return(hierarchy)

  first_point <- if (length(series$data) && is.list(series$data[[1]])) {
    series$data[[1]]
  } else {
    NULL
  }
  hierarchy <- hierarchy_from_object(first_point, keys)
  if (!is.null(hierarchy)) return(hierarchy)

  hierarchy_parse_interaction_name(series$name, keys)
}

hierarchy_depth_colors <- function(level_count) {
  stops <- c("#f4a261", "#e9c46a", "#2a9d8f")
  level_colors <- if (level_count <= length(stops)) {
    stops[seq_len(level_count)]
  } else {
    grDevices::colorRampPalette(stops)(level_count)
  }
  c("#e63946", level_colors)
}

hierarchy_series_depth <- function(hierarchy, keys) {
  aggregated <- vapply(hierarchy[keys], hierarchy_is_aggregated, logical(1))
  concrete <- which(!aggregated)
  if (length(concrete)) max(concrete) else 0L
}

.hierarchy_day_number <- function(value) {
  if (length(value) != 1L || is.character(value) ||
      is.factor(value) || is.logical(value)) {
    return(NA_real_)
  }
  if (is.numeric(value)) return(as.numeric(value))

  date <- tryCatch(as.Date(value), error = function(...) NULL)
  if (length(date) == 1L && !is.na(date)) return(as.numeric(date))

  number <- suppressWarnings(tryCatch(
    as.numeric(unclass(value)),
    error = function(...) NA_real_
  ))
  if (length(number) == 1L && is.finite(number)) number else NA_real_
}

hierarchy_detect_time_labels <- function(plot) {
  if (identical(plot$x$hc_opts$xAxis$type, "datetime")) return("none")

  series <- plot$x$hc_opts$series
  if (!length(series)) return("none")
  points <- series[[1]]$data
  if (!length(points)) return("none")

  x_values <- vapply(
    utils::head(points, 100L),
    function(point) {
      .hierarchy_day_number(if (is.list(point)) point$x else point)
    },
    numeric(1)
  )
  x_values <- x_values[is.finite(x_values)]

  if (length(x_values) < 2L || any(x_values < 3000 | x_values > 40000) ||
      any(x_values != round(x_values))) {
    return("none")
  }

  dates <- as.Date(x_values, origin = "1970-01-01")
  if (!all(format(dates, "%d") == "01")) return("date")

  months <- as.integer(format(dates, "%m"))
  if (all(months %in% c(1L, 4L, 7L, 10L))) return("quarter")
  if (all(months == 1L)) return("year")
  "month"
}

.hierarchy_clean_axis_label <- function(value) {
  if (is.null(value)) return(NULL)
  if (is.character(value) && length(value) >= 1L) {
    value <- value[[1]]
  } else if (inherits(value, "formula") && length(value) >= 2L) {
    value <- deparse(value[[2]])
  } else if (is.name(value) || is.call(value)) {
    value <- deparse(value)
  } else if (inherits(value, "quosure") &&
             requireNamespace("rlang", quietly = TRUE)) {
    value <- rlang::as_label(value)
  } else {
    return(NULL)
  }
  value <- trimws(gsub("`", "", sub("^~", "", value)))
  if (nzchar(value)) value else NULL
}

.hierarchy_same_scalar <- function(x, y) {
  if (is.null(x) || is.null(y) || length(x) != 1L || length(y) != 1L ||
      is.na(x) || is.na(y)) {
    return(FALSE)
  }
  if (identical(x, y) || identical(as.character(x), as.character(y))) {
    return(TRUE)
  }
  x_number <- suppressWarnings(as.numeric(x))
  y_number <- suppressWarnings(as.numeric(y))
  length(x_number) == 1L && length(y_number) == 1L &&
    is.finite(x_number) && is.finite(y_number) &&
    identical(x_number, y_number)
}

hierarchy_infer_axis_name <- function(plot, coordinate, hierarchy_keys) {
  candidates <- character()
  axis_config <- plot$x$hc_opts[[paste0(coordinate, "Axis")]]
  axes <- if (!is.null(axis_config$title)) {
    list(axis_config)
  } else {
    axis_config %||% list()
  }

  for (axis in axes) {
    if (is.list(axis)) {
      candidates <- c(candidates, .hierarchy_clean_axis_label(axis$title$text))
    }
  }

  for (series in plot$x$hc_opts$series %||% list()) {
    for (mapping in list(
      series$mapping[[coordinate]],
      series$hcaes[[coordinate]],
      series$aes[[coordinate]]
    )) {
      candidates <- c(candidates, .hierarchy_clean_axis_label(mapping))
    }

    points <- Filter(is.list, utils::head(series$data %||% list(), 25L))
    point <- if (length(points)) points[[1]] else NULL
    if (!is.list(point) || is.null(names(point))) next

    reserved <- c(
      "x", "y", "z", "value", "name", "id", "color", "group",
      "custom", "marker", "selected", hierarchy_keys
    )
    original_names <- setdiff(names(point), reserved)
    other_coordinate <- if (coordinate == "x") "y" else "x"
    field_scores <- vapply(original_names, function(name) {
      coordinate_matches <- sum(vapply(points, function(item) {
        .hierarchy_same_scalar(item[[name]], item[[coordinate]])
      }, logical(1)))
      other_matches <- sum(vapply(points, function(item) {
        .hierarchy_same_scalar(item[[name]], item[[other_coordinate]])
      }, logical(1)))
      2 * coordinate_matches - other_matches
    }, numeric(1))

    matched_names <- original_names[field_scores > 0]
    matched_names <- matched_names[
      order(field_scores[matched_names], decreasing = TRUE)
    ]
    candidates <- c(candidates, matched_names)

    numeric_names <- names(point)[vapply(point, is.numeric, logical(1))]
    candidates <- c(candidates, setdiff(numeric_names, reserved))
  }

  generic <- c(
    "value", "values", coordinate,
    if (coordinate == "x") c("category", "categories") else character()
  )
  candidates <- candidates[
    !is.na(candidates) & nzchar(candidates) &
      !tolower(candidates) %in% generic
  ]
  if (length(candidates)) candidates[[1]] else NULL
}

hierarchy_apply_time_labels <- function(plot, granularity) {
  if (granularity == "none") return(plot)

  label_expression <- switch(
    granularity,
    quarter = "y + ' Q' + (Math.floor(m / 3) + 1)",
    month = paste0(
      "y + ' ' + ['Jan','Feb','Mar','Apr','May','Jun',",
      "'Jul','Aug','Sep','Oct','Nov','Dec'][m]"
    ),
    year = "String(y)",
    paste0(
      "y + '-' + String(m + 1).padStart(2, '0') + '-' + ",
      "String(d.getUTCDate()).padStart(2, '0')"
    )
  )
  formatter <- htmlwidgets::JS(paste0(
    "function () {",
    " var d = new Date(Math.round(this.value) * 86400000);",
    " var y = d.getUTCFullYear(), m = d.getUTCMonth();",
    " return ", label_expression, ";",
    " }"
  ))

  x_axis <- plot$x$hc_opts$xAxis %||% list()
  if (length(x_axis) > 0L && is.null(names(x_axis))) {
    x_axis[[1]]$labels <- utils::modifyList(
      x_axis[[1]]$labels %||% list(),
      list(formatter = formatter)
    )
  } else {
    x_axis$labels <- utils::modifyList(
      x_axis$labels %||% list(),
      list(formatter = formatter)
    )
  }
  plot$x$hc_opts$xAxis <- x_axis
  plot
}

# Prepare hierarchy metadata and default styling on a Highcharts widget.
hierarchy_prepare_highchart <- function(plot, structure, time_labels) {
  if (!inherits(plot, "htmlwidget")) {
    stop("`plot` must be a highcharter/htmlwidget object.", call. = FALSE)
  }
  hierarchy_validate_structure(structure)

  keys <- hierarchy_structure_keys(structure)
  colors <- hierarchy_depth_colors(length(keys))
  plot$x$hierarchy_structure <- structure
  plot$x$hierarchy_keys <- keys
  plot$x$hierarchy_x_name <- hierarchy_infer_axis_name(plot, "x", keys)
  plot$x$hierarchy_value_name <- hierarchy_infer_axis_name(plot, "y", keys)
  plot$x$hierarchy_colors <- colors

  granularity <- if (time_labels == "auto") {
    hierarchy_detect_time_labels(plot)
  } else {
    time_labels
  }
  plot$x$hierarchy_time_granularity <- granularity
  plot <- hierarchy_apply_time_labels(plot, granularity)

  plot$x$hc_opts$legend <- utils::modifyList(
    plot$x$hc_opts$legend %||% list(),
    list(enabled = FALSE)
  )
  plot$x$hc_opts$tooltip <- utils::modifyList(
    plot$x$hc_opts$tooltip %||% list(),
    list(useHTML = TRUE, shared = FALSE)
  )

  matched <- 0L
  for (index in seq_along(plot$x$hc_opts$series)) {
    series <- plot$x$hc_opts$series[[index]]
    series$showInLegend <- FALSE
    hierarchy <- hierarchy_extract_series(series, keys)

    if (!is.null(hierarchy)) {
      depth <- hierarchy_series_depth(hierarchy, keys)
      series$custom <- series$custom %||% list()
      series$custom$hierarchy <- hierarchy
      series$custom$hierarchyDepth <- depth
      series$name <- hierarchy_readable_name(hierarchy)
      series$color <- colors[[depth + 1L]]
      series$lineWidth <- if (depth == 0L) {
        4
      } else if (depth == length(keys)) {
        1.2
      } else {
        2.5
      }
      series$opacity <- if (depth == length(keys)) 0.65 else 1
      series$marker <- utils::modifyList(
        series$marker %||% list(),
        list(enabled = FALSE, states = list(hover = list(enabled = TRUE)))
      )
      matched <- matched + 1L
    }
    plot$x$hc_opts$series[[index]] <- series
  }

  plot$x$hierarchy_series_count <- matched
  if (length(plot$x$hc_opts$series) && matched == 0L) {
    warning(
      "No Highcharts series contained the hierarchy keys: ",
      paste(keys, collapse = ", "),
      ". Keep these columns in the data supplied to `hc_add_series()` or ",
      "set `series$custom$hierarchy` explicitly.",
      call. = FALSE
    )
  }
  plot
}

#' Shared hierarchy widget stylesheet dependency
#' @noRd
ggelato_hierarchy_core_dependency <- function() {
  htmltools::htmlDependency(
    name = "ggelato-hierarchy-core",
    version = ggelato_hierarchy_asset_version(),
    package = "ggelato",
    src = "htmlwidgets",
    stylesheet = "assets/css/hierarchy-core.css",
    all_files = FALSE
  )
}

#' Adapter dependency: bundled JavaScript plus optional adapter-only CSS
#' @noRd
ggelato_hierarchy_addon_dependency <- function(name, stylesheet = NULL) {
  arguments <- list(
    name = name,
    version = ggelato_hierarchy_asset_version(),
    package = "ggelato",
    src = "htmlwidgets",
    script = paste0(name, ".js"),
    all_files = FALSE
  )
  if (!is.null(stylesheet)) {
    arguments$stylesheet <- file.path("assets", "css", stylesheet)
  }
  do.call(htmltools::htmlDependency, arguments)
}

#' Attach the shared hierarchy widget and an engine-specific adapter
#' @noRd
ggelato_attach_hierarchy_addon <- function(plot, addon_name, init_function,
                                           stylesheet = NULL) {
  plot$dependencies <- c(
    plot$dependencies,
    list(
      ggelato_hierarchy_core_dependency(),
      ggelato_hierarchy_addon_dependency(addon_name, stylesheet)
    )
  )

  htmlwidgets::onRender(plot, sprintf(
    paste0(
      "function(el, x) {",
      " if (typeof window.%s === 'function') {",
      "  setTimeout(function() { window.%s(el, x); }, 100);",
      " } else {",
      "  console.warn('%s.js was not found or failed to load.');",
      " }",
      "}"
    ),
    init_function,
    init_function,
    addon_name
  ))
}
