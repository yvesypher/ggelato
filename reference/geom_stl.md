# STL decomposition layer

Draws the observed series together with its trend, seasonal and
remainder components from an STL decomposition. The `trend`,
`seasonality` and `remainder` aesthetics must be mapped explicitly in
[`gig_aes()`](https://yvesypher.github.io/ggelato/reference/gig_aes.md).

## Usage

``` r
geom_stl(
  mapping = NULL,
  scaled = NULL,
  width = NULL,
  height = NULL,
  elementId = NULL
)
```

## Arguments

- mapping:

  Optional layer-level
  [`gig_aes()`](https://yvesypher.github.io/ggelato/reference/gig_aes.md)
  that overrides the plot mapping.

- scaled:

  Optional table of STL components computed from standardised series,
  with the same columns as the plot data. When supplied, the toolbar can
  switch between the original and the standardised scale.

- width, height:

  Optional widget size (any valid CSS unit).

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
tas_stl <- tas_tourism |>
  aggregate_key((State / Region) * Purpose, Trips = sum(Trips)) |>
  model(stl = STL(Trips)) |>
  components()

gig(tas_stl,
    gig_aes(x = Quarter, y = Trips, trend = trend,
            seasonality = season_year, remainder = remainder)) +
  geom_stl() +
  hierarchy((State / Region) * Purpose)
```
