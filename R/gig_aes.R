#' Aesthetic mappings for gig plots
#'
#' Describes how columns in `data` map to the visual channels used by the
#' `geom_*()` layers - `x`/`y` for [geom_features()], `time`/`value`/
#' `seasonality` for [geom_stl()] - giving every layer one shared mapping
#' vocabulary instead of a separate set of string arguments each.
#'
#' Aesthetics left as `NULL` are dropped, exactly as
#' [ggplot2::aes()] drops arguments the caller did not supply.
#'
#' @param x,y The two primary variables a mark reads. [geom_features()]
#'   treats these as numeric feature columns; [geom_stl()] treats them as
#'   the time/index column and the response column respectively. Each mark
#'   interprets `x`/`y` according to its own diagnostic purpose, the same
#'   way ggplot2 geoms each interpret `aes(x, y)` differently.
#' @param trend,seasonality,remainder Required STL component columns for
#'   [geom_stl()]. Unlike other channels, these are not guessed from column
#'   names - [geom_stl()] refuses to build without all three explicitly
#'   mapped, e.g. `gig_aes(trend = trend, seasonality = season_year,
#'   remainder = remainder)`.
#' @param colour,group Reserved grouping aesthetics. Accepted and carried
#'   on the object, but not yet consumed by any renderer.
#' @param ... Further aesthetics, captured but not interpreted.
#'
#' @return An object of class `gig_aes`: a named list of quosures.
#'
#' @examples
#' gig_aes(x = trend_strength, y = seasonal_strength_year)
#' gig_aes(x = Quarter, y = Trips, seasonality = season_year)
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
        rlang::expr_text(rlang::quo_get_expr(x[[name]])), "\n", sep = "")
  }
  invisible(x)
}

#' Is this object a gig aesthetic mapping?
#'
#' @param x An object.
#' @return `TRUE` or `FALSE`.
#' @export
is_gig_aes <- function(x) inherits(x, "gig_aes")

# Combine a plot-level mapping with a layer-level override. Later wins, the
# same precedence ggplot2 gives a layer's own aes().
merge_gig_aes <- function(base, override) {
  if (is.null(override) || length(override) == 0L) return(base)
  if (is.null(base) || length(base) == 0L) return(override)
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
