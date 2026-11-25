# Australian tourism case study

## Introduction

Hierarchical time series arise when a collection of series can be
aggregated along one or more nested or crossed variables. Examples
include national, state and regional tourism counts, which may be
further disaggregated by travel purpose. Exploring such data requires
views that respect the aggregation structure and that allow an analyst
to move between levels of the hierarchy.

The `ggelato` package provides a layered grammar of graphics for
hierarchical time series, modelled on the design of `ggplot2`. A plot is
created with
[`gig()`](https://yvesypher.github.io/ggelato/reference/gig.md), which
holds the data, the aesthetic mapping and the hierarchical structure,
and a single geometry is then added with `+`. The `fridge` package
coordinates several `ggelato` plots in one interface, so that a
selection made in one view is reflected in all others.

This vignette introduces the main components of the grammar using the
Australian domestic tourism data and concludes by combining three plots
with `fridge()`.

| Component | Role |
|:---|:---|
| [`gig()`](https://yvesypher.github.io/ggelato/reference/gig.md) | Combines the data, the mapping and the hierarchical structure |
| [`gig_aes()`](https://yvesypher.github.io/ggelato/reference/gig_aes.md) | Maps variables to channels such as `x`, `y`, `trend`, `seasonality` and `remainder` |
| [`geom_features()`](https://yvesypher.github.io/ggelato/reference/geom_features.md) | Scatterplot of time series features |
| [`geom_stl()`](https://yvesypher.github.io/ggelato/reference/geom_stl.md) | Time series plot with the STL decomposition |
| [`geom_sunburst()`](https://yvesypher.github.io/ggelato/reference/geom_sunburst.md) | Sunburst display of the hierarchy |

## Setup

``` r

# devtools::install("../fridge") #run this in console
# library(fridge)
library(ggelato)
library(fabletools)
library(feasts)
library(tsibble)
library(dplyr)
```

## Data

The `tourism` data in the `tsibble` package contain quarterly domestic
overnight trips for Australian regions by travel purpose. The
hierarchical structure is `(State/Region)*Purpose`. This means that
`Region` is nested within `State`, while `Purpose` is crossed with both
`State` and `Region`. The structure is imposed with
[`fabletools::aggregate_key()`](https://fabletools.tidyverts.org/reference/aggregate_key.html),
which adds the aggregate series at every level.

``` r

tourism_hts <- tsibble::tourism |>
  aggregate_key((State / Region) * Purpose, Trips = sum(Trips))
```

The same `structure` formula is passed to
[`gig()`](https://yvesypher.github.io/ggelato/reference/gig.md) in every
plot below, so that `ggelato` interprets the rows of the data in the
same way as the aggregation.

## Time series features plot

Features summarise the shape of each series in a small number of numeric
values. A feature table is computed with `feasts` and passed to
[`gig()`](https://yvesypher.github.io/ggelato/reference/gig.md), with
the features of interest mapped to `x` and `y`. The layer
[`geom_features()`](https://yvesypher.github.io/ggelato/reference/geom_features.md)
then draws one point for each series in the hierarchy.

``` r

tourism_ft <- tourism_hts |>
  features(Trips, feature_set(pkgs = "feasts"))

tourism_feasts <- gig(tourism_ft,
    gig_aes(x = trend_strength, 
            y = seasonal_strength_year),
    structure = (State/Region)*Purpose) +
  geom_features()

tourism_feasts
```

## STL decomposition plot

The decomposition of each series into trend, seasonal and remainder
components is computed upstream with `fabletools` and `feasts`. The
components are mapped with the channels `trend`, `seasonality` and
`remainder`, and
[`geom_stl()`](https://yvesypher.github.io/ggelato/reference/geom_stl.md)
displays the series together with its components.

``` r

stl_original <- tourism_hts |>
  model(stl = STL(Trips)) |>
  components()

stl_scaled <- tourism_hts |>
  group_by_key() |>
  mutate(Trips = as.numeric(scale(Trips))) |>
  ungroup() |>
  model(stl = STL(Trips)) |>
  components()
```

``` r

tourism_stl <- gig(
  stl_original,
  gig_aes(
    x = Quarter,
    y = Trips,
    seasonality = season_year,
    trend = trend,
    remainder = remainder
  ),
  structure = (State / Region) * Purpose
) +
  geom_stl(scaled = stl_scaled)

tourism_stl
```

Series at different levels of the hierarchy differ greatly in scale. A
second decomposition is therefore computed on standardised series and
supplied through the `scaled` argument, which allows the plot to switch
between the original and the standardised scale.

## Sunburst

The sunburst displays the hierarchy itself, with one ring for each
level. It requires no mapping beyond the structure, and the data are
supplied as a plain tibble

``` r

tourism_sunburst <- gig(tourism_hts, 
    structure = (State/Region)*Purpose) +
  geom_sunburst(labels = TRUE) 

tourism_sunburst
```

## Coordinating multiple plots with `fridge()` in `fridge` `R` package

Each `ggelato` plot contains a single geometry. Several views are
combined by passing the plots to `fridge()` from the `fridge` package.
The views share a common selection, so that choosing a node of the
hierarchy in the sunburst highlights the corresponding series in the
features plot and in the decomposition plot.

``` r

# fridge(tourism_stl,
#        tourism_feasts, 
#        tourism_sunburst, 
#        fullscreen = FALSE) 
```

## Summary

A `ggelato` plot is built from the data, a mapping and a hierarchical
structure, followed by one geometry. Features and decompositions are
computed upstream with `feasts` and `fabletools`, which keeps the
graphics layer separate from the modelling workflow. Multiple views are
coordinated with `fridge()` rather than within a single plot.

## Session information

``` r

sessionInfo()
#> R version 4.6.2 (2026-10-29)
#> Platform: x86_64-pc-linux-gnu
#> Running under: Ubuntu 26.04.1 LTS
#> 
#> Matrix products: default
#> BLAS:   /usr/lib/x86_64-linux-gnu/openblas-pthread/libblas.so.3 
#> LAPACK: /usr/lib/x86_64-linux-gnu/openblas-pthread/libopenblasp-r0.3.32.so;  LAPACK version 3.12.0
#> 
#> locale:
#>  [1] LC_CTYPE=C.UTF-8       LC_NUMERIC=C           LC_TIME=C.UTF-8       
#>  [4] LC_COLLATE=C.UTF-8     LC_MONETARY=C.UTF-8    LC_MESSAGES=C.UTF-8   
#>  [7] LC_PAPER=C.UTF-8       LC_NAME=C              LC_ADDRESS=C          
#> [10] LC_TELEPHONE=C         LC_MEASUREMENT=C.UTF-8 LC_IDENTIFICATION=C   
#> 
#> time zone: UTC
#> tzcode source: system (glibc)
#> 
#> attached base packages:
#> [1] stats     graphics  grDevices utils     datasets  methods   base     
#> 
#> other attached packages:
#> [1] dplyr_1.2.1      tsibble_1.2.0    feasts_0.5.0     fabletools_0.8.0
#> [5] ggelato_0.1.0   
#> 
#> loaded via a namespace (and not attached):
#>  [1] gtable_0.3.6         jsonlite_2.0.0       compiler_4.6.2      
#>  [4] vecvec_1.5.0         tidyselect_1.2.1     Rcpp_1.1.2          
#>  [7] tidyr_1.3.2          scales_1.4.0         yaml_2.3.12         
#> [10] fastmap_1.2.0        ggplot2_4.0.4        R6_2.6.1            
#> [13] generics_0.1.4       warp_0.2.3           distributional_0.9.0
#> [16] knitr_1.52           htmlwidgets_1.6.4    ggtime_1.1.1        
#> [19] tibble_3.3.1         mixtime_0.5.0        lubridate_1.9.5     
#> [22] tzdb_0.5.0           pillar_1.11.1        RColorBrewer_1.1-3  
#> [25] rlang_1.3.0          xfun_0.62            S7_1.0.0            
#> [28] otel_0.3.0           timechange_0.4.0     cli_3.6.6           
#> [31] withr_3.0.3          progressr_1.1.0      magrittr_2.0.5      
#> [34] digest_0.6.39        grid_4.6.2           slider_0.3.3        
#> [37] lifecycle_1.0.5      anytime_0.3.13       vctrs_0.7.3         
#> [40] evaluate_1.0.5       glue_1.8.1           farver_2.1.2        
#> [43] purrr_1.2.2          rmarkdown_2.32       tools_4.6.2         
#> [46] pkgconfig_2.0.3      htmltools_0.5.9
```
