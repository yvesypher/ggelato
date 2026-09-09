#' Theme for gig plots
#'
#' A composable styling object that can be added to a [gig()] plot with
#' `+`, replacing hardcoded chrome such as the
#' `backgroundColor = "#FFFFFF"` written directly into
#' [add_hierarchy_hc()].
#'
#' @section Status
#'
#' @param background Plot background colour (any CSS colour).
#' @param palette Optional named palette or vector of colours for
#'   hierarchy levels.
#' @param font Optional CSS font family.
#' @param ... Further theme settings, carried through untouched.
#'
#' @return An object of class `gig_theme`.
#'
#' @examples
#' theme_gig(background = "#0B0B0B")
#'
#' @seealso [gig()]
#' @export
theme_gig <- function(background = NULL, palette = NULL, font = NULL, ...) {
  settings <- list(background = background, palette = palette, font = font, ...)
  settings <- settings[!vapply(settings, is.null, logical(1))]
  structure(settings, class = "gig_theme")
}

#' @export
print.gig_theme <- function(x, ...) {
  if (length(x) == 0L) {
    cat("<gig_theme> (no settings)\n")
    return(invisible(x))
  }
  cat("<gig_theme>\n")
  for (name in names(x)) {
    cat("  ", name, ": ", paste(format(x[[name]]), collapse = ", "), "\n",
        sep = "")
  }
  invisible(x)
}

#' Is this object a gig theme?
#'
#' @param x An object.
#' @return `TRUE` or `FALSE`.
#' @export
is_gig_theme <- function(x) inherits(x, "gig_theme")

# Themes combine left-to-right; later settings win.
merge_gig_theme <- function(base, override) {
  if (is.null(base)) return(override)
  if (is.null(override)) return(base)
  structure(
    utils::modifyList(unclass(base), unclass(override)),
    class = "gig_theme"
  )
}
