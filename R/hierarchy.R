#' A reusable hierarchical structure specification
#'
#' Wraps a fabletools-style structure string such as
#' `"(State/Region)*Purpose"` in a first-class object that can be added to
#' any [gig()] plot with `+`. `/` declares a nesting constraint
#' (parent/child), `*` crosses independent groups.
#'
#' Building it once means one parser, one validation, and one object that
#' can be shared across several `geom_features()`/`geom_stl()`/
#' `geom_sunburst()` plots of the same key structure - the hierarchical
#' analogue of reusing a facet specification.
#'
#' @param structure The structure. Either a string,
#'   `hierarchy("(State/Region)*Purpose")`, a bare expression,
#'   `hierarchy((State / Region) * Purpose)`, or a variable holding a
#'   string. All three normalise to the same string.
#'
#' @return An object of class `gig_hierarchy`.
#'
#' @examples
#' hierarchy("(State/Region)*Purpose")
#' hierarchy((State / Region) * Purpose)
#'
#' # Built once, reused across plots of the same key structure:
#' h <- hierarchy((State / Region) * Purpose)
#' \dontrun{
#' gig(stl_cmp, gig_aes(x = Quarter, y = Trips)) + geom_stl() + h
#' gig(tourism_tbl) + geom_sunburst() + h
#' }
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
#' @export
is_gig_hierarchy <- function(x) inherits(x, "gig_hierarchy")

#' Change a structure string or gig_hierarchy to a gig_hierarchy
#'
#' Lets callers (including `fridge::fridge()`) accept either form.
#'
#' @param x A string or a `gig_hierarchy`.
#' @return A `gig_hierarchy`, or `NULL` if `x` is `NULL`.
#' @export
as_gig_hierarchy <- function(x) {
  if (is.null(x)) return(NULL)
  if (is_gig_hierarchy(x)) return(x)
  if (is.character(x) && length(x) == 1L) return(new_gig_hierarchy(x))
  stop(
    "Cannot interpret a <", class(x)[[1L]],
    "> as a hierarchy specification. Supply a string or hierarchy().",
    call. = FALSE
  )
}

gig_hierarchy_string <- function(x) {
  if (is.null(x)) NULL else as_gig_hierarchy(x)$structure
}
