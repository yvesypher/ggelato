# Build a gig plot into an htmlwidget

Printing a `gig` plot builds it automatically. Call `gig_build()`
directly to obtain the htmlwidget, for example to save it with
[`htmlwidgets::saveWidget()`](https://rdrr.io/pkg/htmlwidgets/man/saveWidget.html)
or to pass it to another function that expects an htmlwidget.

## Usage

``` r
gig_build(x)
```

## Arguments

- x:

  A `gig` plot specification.

## Value

An htmlwidget of class `gig_point`, `gig_stldp` or `gig_sunburst`,
depending on the geom layer.

## See also

[`gig()`](https://yvesypher.github.io/ggelato/reference/gig.md)

## Examples

``` r
tas_hts <- fabletools::aggregate_key(
  aus_tourism[aus_tourism$State == "Tasmania", ],
  (State / Region) * Purpose,
  Trips = sum(Trips)
)

plot_spec <- gig(tas_hts, structure = (State / Region) * Purpose) +
  geom_sunburst()
widget <- gig_build(plot_spec)
class(widget)
#> [1] "gig_sunburst" "htmlwidget"  
```
