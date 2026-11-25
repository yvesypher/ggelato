#' Aggregation structure of a hierarchical or grouped time series
#'
#' Wraps an aggregation structure, written as in
#' [fabletools::aggregate_key()], in an object that can be added to any
#' [gig()] plot with `+`. The operator `/` denotes nesting (parent / child)
#' and `*` denotes crossing of independent groupings. A single `hierarchy()`
#' object can be shared by several plots of the same data.
#'
#' @param structure The aggregation structure, either as a bare expression,
#'   `(State / Region) * Purpose`, or as a string,
#'   `"(State/Region)*Purpose"`. A variable holding such a string is also
#'   accepted.
#'
#' @return An object of class `gig_hierarchy`.
#'
#' @examples
#' hierarchy((State / Region) * Purpose)
#' hierarchy("(State/Region)*Purpose")
#'
#' # One structure object can be added to several plots
#' tourism_structure <- hierarchy((State / Region) * Purpose)
#' plot_spec <- gig(aus_tourism) + geom_sunburst() + tourism_structure
#' plot_spec$hierarchy
#'
#' @seealso [gig()]
#' @export
hierarchy <- function(structure) {
  new_gig_hierarchy_from_quo(rlang::enquo(structure))
}

new_gig_hierarchy_from_quo <- function(quo) {
  evaluated <- tryCatch(rlang::eval_tidy(quo), error = function(...) NULL)

  if (is_gig_hierarchy(evaluated)) {
    return(evaluated)
  }
  if (is.character(evaluated) && length(evaluated) == 1L &&
    !is.na(evaluated) && nzchar(evaluated)) {
    return(new_gig_hierarchy(evaluated))
  }

  spec <- gsub("\\s+", "", rlang::expr_text(rlang::quo_get_expr(quo)))
  new_gig_hierarchy(spec)
}

new_gig_hierarchy <- function(structure) {
  hierarchy_validate_structure(structure)
  base::structure(
    list(
      structure = structure,
      keys = hierarchy_structure_keys(structure)
    ),
    class = "gig_hierarchy"
  )
}

#' @export
print.gig_hierarchy <- function(x, ...) {
  cat("<gig_hierarchy> ", x$structure, "\n", sep = "")
  cat("  keys: ", paste(x$keys, collapse = ", "), "\n", sep = "")
  invisible(x)
}

#' Is this object a gig hierarchy specification?
#'
#' @param x An object.
#' @return `TRUE` or `FALSE`.
#' @examples
#' is_gig_hierarchy(hierarchy(State / Region))
#' @export
is_gig_hierarchy <- function(x) inherits(x, "gig_hierarchy")

#' Coerce a structure string to a gig_hierarchy
#'
#' Allows functions, including `fridge::fridge()`, to accept either a string
#' or a [hierarchy()] object.
#'
#' @param x A string or a `gig_hierarchy`.
#' @return A `gig_hierarchy`, or `NULL` if `x` is `NULL`.
#' @examples
#' as_gig_hierarchy("(State/Region)*Purpose")
#' @export
as_gig_hierarchy <- function(x) {
  if (is.null(x)) {
    return(NULL)
  }
  if (is_gig_hierarchy(x)) {
    return(x)
  }
  if (is.character(x) && length(x) == 1L) {
    return(new_gig_hierarchy(x))
  }
  stop(
    "Cannot interpret a <", class(x)[[1L]],
    "> as a hierarchy specification. Supply a string or hierarchy().",
    call. = FALSE
  )
}

gig_hierarchy_string <- function(x) {
  if (is.null(x)) NULL else as_gig_hierarchy(x)$structure
}
