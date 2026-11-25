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
