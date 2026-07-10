#' Add draggable hierarchy tree to a highcharter plot
#'
#' @param plot A highcharter/htmlwidget object.
#' @param structure Hierarchy structure, e.g. "(State/Region)*Purpose".
#'
#' @export
add_hierarchy_hc <- function(plot, structure) {

  if (!inherits(plot, "htmlwidget")) {
    stop("`plot` must be a highcharter/htmlwidget object.", call. = FALSE)
  }

  if (!is.character(structure) || length(structure) != 1 || !nzchar(structure)) {
    stop("`structure` must be a non-empty character string.", call. = FALSE)
  }

  `%||%` <- function(x, y) {
    if (is.null(x)) y else x
  }

  extract_structure_keys <- function(structure) {
    keys <- unlist(regmatches(
      structure,
      gregexpr("[A-Za-z][A-Za-z0-9_.]*", structure)
    ))

    unique(keys)
  }

  is_aggregated <- function(x) {
    x <- as.character(x)

    is.na(x) ||
      x == "" ||
      grepl("aggregated", x, ignore.case = TRUE) ||
      x %in% c("NA", "NaN", "NULL")
  }

  clean_value <- function(x) {
    x <- as.character(x)

    if (is_aggregated(x)) {
      "<aggregated>"
    } else {
      x
    }
  }

  make_readable_name <- function(hierarchy) {
    paste(
      paste(names(hierarchy), unlist(hierarchy), sep = ": "),
      collapse = "; "
    )
  }

  parse_interaction_name <- function(series_name, keys) {
    if (is.null(series_name) || is.na(series_name)) {
      return(NULL)
    }

    series_name <- as.character(series_name)

    pieces <- strsplit(series_name, ".", fixed = TRUE)[[1]]

    if (length(pieces) != length(keys)) {
      return(NULL)
    }

    pieces <- vapply(pieces, clean_value, character(1))
    names(pieces) <- keys

    as.list(pieces)
  }

  infer_y_name <- function(plot, hierarchy_keys) {

    clean_label <- function(x) {
      if (is.null(x)) return(NULL)

      if (is.character(x) && length(x) >= 1) {
        x <- x[1]
      } else if (inherits(x, "formula") && length(x) >= 2) {
        x <- deparse(x[[2]])
      } else if (is.name(x) || is.call(x)) {
        x <- deparse(x)
      } else if (inherits(x, "quosure") && requireNamespace("rlang", quietly = TRUE)) {
        x <- rlang::as_label(x)
      } else {
        return(NULL)
      }

      x <- gsub("^~", "", x)
      x <- gsub("`", "", x)
      x <- trimws(x)

      if (!nzchar(x)) return(NULL)

      x
    }

    candidates <- character()

    y_axis <- plot$x$hc_opts$yAxis

    if (!is.null(y_axis$title$text)) {
      candidates <- c(candidates, clean_label(y_axis$title$text))
    }

    if (is.list(y_axis) && is.null(y_axis$title)) {
      for (axis in y_axis) {
        if (is.list(axis) && !is.null(axis$title$text)) {
          candidates <- c(candidates, clean_label(axis$title$text))
        }
      }
    }

    series <- plot$x$hc_opts$series

    if (!is.null(series)) {
      for (s in series) {

        candidates <- c(
          candidates,
          clean_label(s$mapping$y),
          clean_label(s$hcaes$y),
          clean_label(s$aes$y)
        )

        if (!is.null(s$data) && length(s$data) > 0) {
          point <- s$data[[1]]

          if (is.list(point) && !is.null(names(point))) {
            point_names <- names(point)

            possible_y_names <- setdiff(
              point_names,
              c(
                "x", "y", "z", "value", "name", "id", "color",
                "custom", "marker", "selected",
                hierarchy_keys
              )
            )

            numeric_y_names <- possible_y_names[
              vapply(
                possible_y_names,
                function(nm) is.numeric(point[[nm]]),
                logical(1)
              )
            ]

            candidates <- c(candidates, numeric_y_names)
          }
        }
      }
    }

    candidates <- candidates[
      !is.na(candidates) &
        nzchar(candidates) &
        !tolower(candidates) %in% c("value", "values", "y")
    ]

    if (length(candidates) == 0) {
      NULL
    } else {
      candidates[1]
    }
  }

  hierarchy_keys <- extract_structure_keys(structure)

  plot$x$hierarchy_structure <- structure
  plot$x$hierarchy_keys <- hierarchy_keys
  plot$x$hierarchy_value_name <- infer_y_name(plot, hierarchy_keys)
  plot$x$hierarchy_hide_legend <- TRUE

  plot$x$hc_opts$legend <- modifyList(
    plot$x$hc_opts$legend %||% list(),
    list(enabled = FALSE)
  )

  plot$x$hc_opts$tooltip <- modifyList(
    plot$x$hc_opts$tooltip %||% list(),
    list(
      useHTML = TRUE,
      shared = FALSE
    )
  )

  if (!is.null(plot$x$hc_opts$series)) {
    for (i in seq_along(plot$x$hc_opts$series)) {

      s <- plot$x$hc_opts$series[[i]]

      s$showInLegend <- FALSE

      if (is.null(s$custom$hierarchy)) {
        hierarchy <- parse_interaction_name(s$name, hierarchy_keys)

        if (!is.null(hierarchy)) {
          s$custom <- s$custom %||% list()
          s$custom$hierarchy <- hierarchy
          s$name <- make_readable_name(hierarchy)
        }
      }

      plot$x$hc_opts$series[[i]] <- s
    }
  }

  addon_dep <- htmltools::htmlDependency(
    name = "add_hierarchy_hc",
    version = "1.0.0",
    package = "ggelato",
    src = "htmlwidgets",
    script = "add_hierarchy_hc.js",
    stylesheet = "add_hierarchy_hc.css",
    all_files = FALSE
  )

  plot$dependencies <- c(plot$dependencies, list(addon_dep))

  htmlwidgets::onRender(
    plot,
    "
    function(el, x) {
      if (typeof window.init_hierarchy_hc === 'function') {
        window.init_hierarchy_hc(el, x);
      } else {
        console.warn('add_hierarchy_hc.js was not found or failed to load.');
      }
    }
    "
  )
}
