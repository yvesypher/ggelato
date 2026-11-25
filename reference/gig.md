# Create a gig plot specification

`gig()` starts a plot of a hierarchical or grouped time series. It holds
the data, the default aesthetic mapping and, optionally, the aggregation
structure. Components are then added with `+`:

## Usage

``` r
gig(data, mapping = gig_aes(), structure = NULL)
```

## Arguments

- data:

  A data frame. For
  [`geom_features()`](https://yvesypher.github.io/ggelato/reference/geom_features.md),
  one row per series containing the key columns and numeric feature
  columns. For
  [`geom_stl()`](https://yvesypher.github.io/ggelato/reference/geom_stl.md),
  a table of STL components. For
  [`geom_sunburst()`](https://yvesypher.github.io/ggelato/reference/geom_sunburst.md),
  any table containing the key columns.

- mapping:

  A
  [`gig_aes()`](https://yvesypher.github.io/ggelato/reference/gig_aes.md)
  mapping. Layers may override it.

- structure:

  Optional aggregation structure. Either a bare expression such as
  `(State / Region) * Purpose`, a string such as
  `"(State/Region)*Purpose"`, or a
  [`hierarchy()`](https://yvesypher.github.io/ggelato/reference/hierarchy.md)
  object. Adding `+ hierarchy(...)` afterwards overrides it.

## Value

An object of class `gig`.

## Details

- one `geom_*()` layer,
  [`geom_features()`](https://yvesypher.github.io/ggelato/reference/geom_features.md),
  [`geom_stl()`](https://yvesypher.github.io/ggelato/reference/geom_stl.md)
  or
  [`geom_sunburst()`](https://yvesypher.github.io/ggelato/reference/geom_sunburst.md);

- a
  [`hierarchy()`](https://yvesypher.github.io/ggelato/reference/hierarchy.md)
  specification, if it was not supplied through `structure`;

- a
  [`gig_aes()`](https://yvesypher.github.io/ggelato/reference/gig_aes.md)
  mapping, which is merged into the plot mapping.

The plot is drawn when it is printed. Use
[`gig_build()`](https://yvesypher.github.io/ggelato/reference/gig_build.md)
to obtain the underlying htmlwidget, for example to save it with
[`htmlwidgets::saveWidget()`](https://rdrr.io/pkg/htmlwidgets/man/saveWidget.html).

## See also

[`gig_aes()`](https://yvesypher.github.io/ggelato/reference/gig_aes.md),
[`hierarchy()`](https://yvesypher.github.io/ggelato/reference/hierarchy.md),
[`gig_build()`](https://yvesypher.github.io/ggelato/reference/gig_build.md)

## Examples

``` r
library(fabletools)
library(feasts)

tas_tourism <- aus_tourism[aus_tourism$State == "Tasmania", ]
tas_features <- tas_tourism |>
  aggregate_key((State / Region) * Purpose, Trips = sum(Trips)) |>
  features(Trips, feat_stl)

gig(tas_features,
    gig_aes(x = trend_strength, y = seasonal_strength_year),
    structure = (State / Region) * Purpose) +
  geom_features()
```
