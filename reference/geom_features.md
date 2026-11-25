# Feature-space scatter layer

Draws each series as a point in a two-dimensional feature space, such as
trend strength against seasonal strength. The variables on either axis
can be changed interactively to any other numeric column of `data`.

## Usage

``` r
geom_features(mapping = NULL, width = NULL, height = NULL, elementId = NULL)
```

## Arguments

- mapping:

  Optional layer-level
  [`gig_aes()`](https://yvesypher.github.io/ggelato/reference/gig_aes.md)
  that overrides the plot mapping. `x` and `y` give the initial feature
  columns.

- width, height:

  Optional widget size (any valid CSS unit). When omitted, sizing
  follows the htmlwidgets and knitr defaults.

- elementId:

  Optional element id.

## Value

A `gig_layer`.

## See also

[`gig()`](https://yvesypher.github.io/ggelato/reference/gig.md)

## Examples

``` r
library(fabletools)
library(feasts)

tas_tourism <- aus_tourism[aus_tourism$State == "Tasmania", ]
tas_features <- tas_tourism |>
  aggregate_key((State / Region) * Purpose, Trips = sum(Trips)) |>
  features(Trips, feat_stl)

gig(tas_features, gig_aes(x = trend_strength, y = seasonal_strength_year)) +
  geom_features() +
  hierarchy((State / Region) * Purpose)
```
