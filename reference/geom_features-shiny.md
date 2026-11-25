# Shiny bindings for geom_features()

Output and render functions for using a `gig() + geom_features()` plot
within Shiny applications and interactive R Markdown documents.

## Usage

``` r
geom_featuresOutput(outputId, width = "100%", height = "400px")

renderGeomFeatures(expr, env = parent.frame(), quoted = FALSE)
```

## Arguments

- outputId:

  Output variable to read from.

- width, height:

  A valid CSS unit (such as `"100%"` or `"400px"`) or a number, which is
  coerced to a string and has `"px"` appended.

- expr:

  An expression that generates a `gig() + geom_features()` plot.

- env:

  The environment in which to evaluate `expr`.

- quoted:

  Is `expr` a quoted expression (with
  [`quote()`](https://rdrr.io/r/base/substitute.html))?

## Value

`geom_featuresOutput()` returns a Shiny output element and
`renderGeomFeatures()` returns a Shiny render function.

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
tas_features <- features(tas_hts, Trips, feat_stl)

ui <- fluidPage(geom_featuresOutput("features", height = "600px"))
server <- function(input, output, session) {
  output$features <- renderGeomFeatures(
    gig(tas_features,
        gig_aes(x = trend_strength, y = seasonal_strength_year)) +
      geom_features() +
      hierarchy((State / Region) * Purpose)
  )
}
shinyApp(ui, server)
}
```
