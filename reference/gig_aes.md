# Aesthetic mappings for gig plots

Describes how columns of the plot data map to the visual channels of the
`geom_*()` layers, so that every layer shares one mapping vocabulary.
Aesthetics are given as bare column names or expressions, as in
[`ggplot2::aes()`](https://ggplot2.tidyverse.org/reference/aes.html).
Aesthetics left as `NULL` are dropped.

## Usage

``` r
gig_aes(
  x = NULL,
  y = NULL,
  trend = NULL,
  seasonality = NULL,
  remainder = NULL,
  colour = NULL,
  group = NULL,
  ...
)
```

## Arguments

- x, y:

  The two primary variables.
  [`geom_features()`](https://yvesypher.github.io/ggelato/reference/geom_features.md)
  reads them as the initial feature columns on the horizontal and
  vertical axes.
  [`geom_stl()`](https://yvesypher.github.io/ggelato/reference/geom_stl.md)
  reads `x` as the time index and `y` as the observed series.

- trend, seasonality, remainder:

  STL component columns, required by
  [`geom_stl()`](https://yvesypher.github.io/ggelato/reference/geom_stl.md).
  They are never guessed from column names.

- colour, group:

  Reserved for future use. They are stored on the mapping but not yet
  used by any layer.

- ...:

  Further aesthetics, stored but not interpreted.

## Value

An object of class `gig_aes`, a named list of quosures.

## See also

[`gig()`](https://yvesypher.github.io/ggelato/reference/gig.md),
[`geom_features()`](https://yvesypher.github.io/ggelato/reference/geom_features.md),
[`geom_stl()`](https://yvesypher.github.io/ggelato/reference/geom_stl.md)

## Examples

``` r
gig_aes(x = trend_strength, y = seasonal_strength_year)
#> <gig_aes>
#>   x -> trend_strength
#>   y -> seasonal_strength_year
gig_aes(x = Quarter, y = Trips, trend = trend,
        seasonality = season_year, remainder = remainder)
#> <gig_aes>
#>   x -> Quarter
#>   y -> Trips
#>   trend -> trend
#>   seasonality -> season_year
#>   remainder -> remainder
```
