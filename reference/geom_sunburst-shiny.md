# Shiny bindings for geom_sunburst()

Output and render functions for using a `gig() + geom_sunburst()` plot
within Shiny applications and interactive R Markdown documents.

## Usage

``` r
geom_sunburstOutput(outputId, width = "100%", height = "400px")

renderGeomSunburst(expr, env = parent.frame(), quoted = FALSE)
```

## Arguments

- outputId:

  Output variable to read from.

- width, height:

  A valid CSS unit (such as `"100%"` or `"400px"`) or a number, which is
  coerced to a string and has `"px"` appended.

- expr:

  An expression that generates a `gig() + geom_sunburst()` plot.

- env:

  The environment in which to evaluate `expr`.

- quoted:

  Is `expr` a quoted expression (with
  [`quote()`](https://rdrr.io/r/base/substitute.html))?

## Value

`geom_sunburstOutput()` returns a Shiny output element and
`renderGeomSunburst()` returns a Shiny render function.

## Examples

``` r
if (FALSE) { # interactive() && requireNamespace("feasts", quietly = TRUE)
library(shiny)
library(fabletools)
library(feasts)

tas_hts <- aggregate_key(
  aus_tourism[aus_tourism$State == "Tasmania", ],
  (State / Region) * Purpose, Trips = sum(Trips)
)

ui <- fluidPage(geom_sunburstOutput("structure", height = "600px"))
server <- function(input, output, session) {
  output$structure <- renderGeomSunburst(
    gig(tas_hts) +
      geom_sunburst() +
      hierarchy((State / Region) * Purpose)
  )
}
shinyApp(ui, server)
}
```
