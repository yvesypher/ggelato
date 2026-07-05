#' Add Hierarchy to Plot
#'
#' @param plot A plotly object to which the hierarchy will be added.
#' @param structure A string defining the hierarchy structure (e.g., "(State/Region)*Purpose").
#' @export
add_hierarchy <- function(plot, structure) {

  plot$x$hierarchy_structure <- structure

  addon_dep <- htmltools::htmlDependency(
    name = "add_hierarchy",
    version = as.character(Sys.time()),
    package = "ggelato",
    src = "inst/htmlwidgets",
    script = "add_hierarchy.js",
    stylesheet = "add_hierarchy.css"
  )

  plot$dependencies <- c(plot$dependencies, list(addon_dep))

  plot <- htmlwidgets::onRender(
    plot,
    "function(el, x) {
       if (typeof window.init_hierarchy === 'function') {
         setTimeout(function() {
           window.init_hierarchy(el, x);
         }, 100);
       } else {
         console.warn('add_hierarchy.js was not found or failed to load.');
       }
    }"
  )

  return(plot)
}
