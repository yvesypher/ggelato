#' Aesthetic mappings for gig plots
#'
#' Describes how columns of the plot data map to the visual channels of the
#' `geom_*()` layers, so that every layer shares one mapping vocabulary.
#' Aesthetics are given as bare column names or expressions, as in
#' `ggplot2::aes()`. Aesthetics left as `NULL` are dropped.
#'
#' @param x,y The two primary variables. [geom_features()] reads them as the
#'   initial feature columns on the horizontal and vertical axes.
#'   [geom_stl()] reads `x` as the time index and `y` as the observed series.
#' @param trend,seasonality,remainder STL component columns, required by
#'   [geom_stl()]. They are never guessed from column names.
#' @param colour,group Reserved for future use. They are stored on the
#'   mapping but not yet used by any layer.
#' @param ... Further aesthetics, stored but not interpreted.
#'
#' @return An object of class `gig_aes`, a named list of quosures.
#'
#' @examples
#' gig_aes(x = trend_strength, y = seasonal_strength_year)
#' gig_aes(
#'   x = Quarter, y = Trips, trend = trend,
#'   seasonality = season_year, remainder = remainder
#' )
#'
#' @seealso [gig()], [geom_features()], [geom_stl()]
#' @export
gig_aes <- function(x = NULL, y = NULL,
                    trend = NULL, seasonality = NULL, remainder = NULL,
                    colour = NULL, group = NULL, ...) {
  mapping <- rlang::enquos(
    x = x, y = y, trend = trend,
    seasonality = seasonality, remainder = remainder, colour = colour, group = group,
    ...,
    .ignore_empty = "all"
  )
  # enquos() keeps arguments that were explicitly passed as NULL; drop those
  # too so `gig_aes(x = NULL)` behaves like not supplying `x` at all.
  mapping <- mapping[!vapply(mapping, rlang::quo_is_null, logical(1))]
  structure(mapping, class = "gig_aes")
}

#' @export
print.gig_aes <- function(x, ...) {
  if (length(x) == 0L) {
    cat("<gig_aes> (empty)\n")
    return(invisible(x))
  }
  cat("<gig_aes>\n")
  for (name in names(x)) {
    cat("  ", name, " -> ",
      rlang::expr_text(rlang::quo_get_expr(x[[name]])), "\n",
      sep = ""
    )
  }
  invisible(x)
}

#' Is this object a gig aesthetic mapping?
#'
#' @param x An object.
#' @return `TRUE` or `FALSE`.
#' @examples
#' is_gig_aes(gig_aes(x = Trips))
#' @export
is_gig_aes <- function(x) inherits(x, "gig_aes")

# Combine a plot-level mapping with a layer-level override. Later wins, the
# same precedence ggplot2 gives a layer's own aes().
merge_gig_aes <- function(base, override) {
  if (is.null(override) || length(override) == 0L) {
    return(base)
  }
  if (is.null(base) || length(base) == 0L) {
    return(override)
  }
  structure(
    utils::modifyList(unclass(base), unclass(override)),
    class = "gig_aes"
  )
}

# Turn a mapping into concrete column names against `data`.
#
# Symbol aesthetics (`y = Trips`) resolve to the column name directly,
# which is what lets prep_gig_data()/prep_gig_stldp_data() and every JS
# renderer keep working unchanged - they still receive plain column names.
resolve_gig_aes <- function(mapping, data) {
  data <- as.data.frame(data)
  if (is.null(mapping) || length(mapping) == 0L) {
    return(list(data = data, columns = list()))
  }

  columns <- list()
  for (name in names(mapping)) {
    quo <- mapping[[name]]

    if (rlang::quo_is_symbol(quo)) {
      column_name <- rlang::as_name(quo)
      if (!column_name %in% names(data)) {
        stop(
          "Aesthetic `", name, "` maps to column `", column_name,
          "`, which was not found in the data.",
          call. = FALSE
        )
      }
      columns[[name]] <- column_name
      next
    }

    computed_name <- paste0(".gig_", name)
    values <- rlang::eval_tidy(quo, data = data)
    if (length(values) != nrow(data) && length(values) != 1L) {
      stop(
        "Aesthetic `", name, "` must produce one value per row (or a single ",
        "value to recycle); it produced ", length(values), ".",
        call. = FALSE
      )
    }
    data[[computed_name]] <- values
    columns[[name]] <- computed_name
  }

  list(data = data, columns = columns)
}
