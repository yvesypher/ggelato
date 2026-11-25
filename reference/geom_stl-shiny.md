# Shiny bindings for geom_stl()

Output and render functions for using a `gig() + geom_stl()` plot within
Shiny applications and interactive R Markdown documents.

## Usage

``` r
geom_stlOutput(outputId, width = "100%", height = "400px")

renderGeomStl(expr, env = parent.frame(), quoted = FALSE)
```

## Arguments

- outputId:

  Output variable to read from.

- width, height:

  A valid CSS unit (such as `"100%"` or `"400px"`) or a number, which is
  coerced to a string and has `"px"` appended.

- expr:

  An expression that generates a `gig() + geom_stl()` plot.

- env:

  The environment in which to evaluate `expr`.

- quoted:

  Is `expr` a quoted expression (with
  [`quote()`](https://rdrr.io/r/base/substitute.html))?

## Value

`geom_stlOutput()` returns a Shiny output element and `renderGeomStl()`
returns a Shiny render function.

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
tas_stl <- components(model(tas_hts, stl = STL(Trips)))

ui <- fluidPage(geom_stlOutput("stl", height = "600px"))
server <- function(input, output, session) {
  output$stl <- renderGeomStl(
    gig(tas_stl,
        gig_aes(x = Quarter, y = Trips, trend = trend,
                seasonality = season_year, remainder = remainder)) +
      geom_stl() +
      hierarchy((State / Region) * Purpose)
  )
}
shinyApp(ui, server)
}
```
