# Internal scaffolding shared by geom_features()/geom_stl()/geom_sunburst().

new_gig_layer <- function(geom, mapping = NULL, params = list()) {
  if (!is.null(mapping) && !is_gig_aes(mapping)) {
    stop("`mapping` must be created with gig_aes().", call. = FALSE)
  }
  structure(
    list(geom = geom, mapping = mapping, params = params),
    class = "gig_layer"
  )
}

#' Is this object a gig layer?
#'
#' @param x An object.
#' @return `TRUE` or `FALSE`.
#' @export
is_gig_layer <- function(x) inherits(x, "gig_layer")

#' @export
print.gig_layer <- function(x, ...) {
  cat("<gig_layer> geom: ", x$geom, "\n", sep = "")
  if (!is.null(x$mapping) && length(x$mapping)) {
    cat("  mapping override: ", paste(names(x$mapping), collapse = ", "), "\n",
        sep = "")
  }
  invisible(x)
}
