# ggelato

`ggelato` (Grammar of Graphics for Exploring and Layering Aggregated
Time series) provides interactive graphics for hierarchical and grouped
time series. Plots are specified with a layered grammar in the style of
`ggplot2`. Each plot includes a hierarchy widget for selecting,
reordering and filtering the levels of the structure.

## Installation

Install the released version from CRAN with

``` r

install.packages("ggelato")
```

or the development version from GitHub with

``` r

# install.packages("pak")
pak::pak("yvesypher/ggelato")
```

## Example

``` r

library(ggelato)
library(fabletools)
library(feasts)

tourism_hts <- aus_tourism |>
  aggregate_key((State / Region) * Purpose, Trips = sum(Trips))

tourism_features <- tourism_hts |>
  features(Trips, feat_stl)

gig(tourism_features,
    gig_aes(x = trend_strength, y = seasonal_strength_year)) +
  geom_features() +
  hierarchy((State / Region) * Purpose)
```

[`geom_stl()`](https://yvesypher.github.io/ggelato/reference/geom_stl.md)
displays STL decompositions and
[`geom_sunburst()`](https://yvesypher.github.io/ggelato/reference/geom_sunburst.md)
displays the aggregation structure. Several plots can be coordinated
with the [fridge](https://github.com/yvesypher/fridge) package. See
[`vignette("ggelato")`](https://yvesypher.github.io/ggelato/articles/ggelato.md)
for a full introduction.
