# Sunburst layer

Draws the aggregation structure as a sunburst, in which each ring is one
level of the hierarchy. The data should contain the aggregated series as
well as the bottom-level series, as returned by
[`fabletools::aggregate_key()`](https://fabletools.tidyverts.org/reference/aggregate_key.html)
or by
[`fabletools::features()`](https://fabletools.tidyverts.org/reference/features.html)
applied to its result. A sunburst requires an aggregation structure,
supplied through `gig(structure = )` or `+ hierarchy()`.

## Usage

``` r
geom_sunburst(
  mapping = NULL,
  labels = TRUE,
  width = NULL,
  height = NULL,
  elementId = NULL
)
```

## Arguments

- mapping:

  Optional layer-level
  [`gig_aes()`](https://yvesypher.github.io/ggelato/reference/gig_aes.md).
  Accepted for consistency with the other layers; the sunburst does not
  use any aesthetic.

- labels:

  Show segment labels initially (default `TRUE`). Labels can also be
  toggled from the toolbar.

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
tas_hts <- fabletools::aggregate_key(
  aus_tourism[aus_tourism$State == "Tasmania", ],
  (State / Region) * Purpose, Trips = sum(Trips)
)

gig(tas_hts) +
  geom_sunburst() +
  hierarchy((State / Region) * Purpose)
```
