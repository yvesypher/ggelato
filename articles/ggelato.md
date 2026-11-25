# Interactive graphics for hierarchical time series

The ggelato package provides interactive graphics for exploring
hierarchical and grouped time series. Plots are specified with a layered
grammar in the style of ggplot2. A plot starts with
[`gig()`](https://yvesypher.github.io/ggelato/reference/gig.md), which
holds the data and the aesthetic mapping, and further components are
added with `+`.

- A geom layer chooses the view.
  [`geom_features()`](https://yvesypher.github.io/ggelato/reference/geom_features.md)
  draws a feature space,
  [`geom_stl()`](https://yvesypher.github.io/ggelato/reference/geom_stl.md)
  draws an STL decomposition and
  [`geom_sunburst()`](https://yvesypher.github.io/ggelato/reference/geom_sunburst.md)
  draws the aggregation structure.
- [`hierarchy()`](https://yvesypher.github.io/ggelato/reference/hierarchy.md)
  declares the aggregation structure, using the same notation as
  [`fabletools::aggregate_key()`](https://fabletools.tidyverts.org/reference/aggregate_key.html).
- [`gig_aes()`](https://yvesypher.github.io/ggelato/reference/gig_aes.md)
  maps columns of the data to the channels read by the geom layer.

Every plot carries a hierarchy widget, which displays the levels of the
aggregation structure. Levels can be reordered by dragging and switched
on or off by clicking, and the series at a chosen level can be filtered
by value. A toolbar on each plot provides box and lasso selection,
several selection modes, label control and a reset button.

``` r

library(ggelato)
library(fabletools)
library(feasts)
library(tsibble)
```

## Data

The `aus_tourism` data contain quarterly overnight trips from 1998 Q1 to
2022 Q4 for the 76 tourism regions of Australia, disaggregated by
purpose of travel. Regions are nested within states, and purpose of
travel is crossed with both, which gives the grouped structure
`(State / Region) * Purpose`.

To keep this vignette small, the examples use the regions of Victoria
and Tasmania. The series at every level of the structure are computed
with
[`aggregate_key()`](https://fabletools.tidyverts.org/reference/aggregate_key.html).

``` r

south_east <- aus_tourism[aus_tourism$State %in% c("Victoria", "Tasmania"), ]

tourism_hts <- south_east |>
  aggregate_key((State / Region) * Purpose, Trips = sum(Trips))
tourism_hts
#> # A tsibble: 14,000 x 5 [1Q]
#> # Key:       State, Purpose, Region [140]
#> Loading required namespace: crayon
#>    Quarter State        Purpose      Region       Trips
#>      <qtr> <chr*>       <chr*>       <chr*>       <dbl>
#>  1 1998 Q1 <aggregated> <aggregated> <aggregated> 6992.
#>  2 1998 Q2 <aggregated> <aggregated> <aggregated> 5489.
#>  3 1998 Q3 <aggregated> <aggregated> <aggregated> 4719.
#>  4 1998 Q4 <aggregated> <aggregated> <aggregated> 5355.
#>  5 1999 Q1 <aggregated> <aggregated> <aggregated> 6230.
#>  6 1999 Q2 <aggregated> <aggregated> <aggregated> 5183.
#>  7 1999 Q3 <aggregated> <aggregated> <aggregated> 4214.
#>  8 1999 Q4 <aggregated> <aggregated> <aggregated> 4793.
#>  9 2000 Q1 <aggregated> <aggregated> <aggregated> 6356.
#> 10 2000 Q2 <aggregated> <aggregated> <aggregated> 5011.
#> # ℹ 13,990 more rows
```

The aggregated series are marked `<aggregated>` in the key columns. The
result contains 140 series. These are the total, the 2 states and the 25
regions, each taken over all purposes of travel and for each of the 4
purposes separately.

## Declaring the aggregation structure

The aggregation structure can be supplied to
[`gig()`](https://yvesypher.github.io/ggelato/reference/gig.md) through
its `structure` argument or added afterwards with `+ hierarchy()`. The
two forms below are equivalent.

``` r

gig(data, structure = (State / Region) * Purpose) + geom_features()

gig(data) + geom_features() + hierarchy((State / Region) * Purpose)
```

A
[`hierarchy()`](https://yvesypher.github.io/ggelato/reference/hierarchy.md)
object can also be created once and added to several plots of the same
data.

``` r

tourism_structure <- hierarchy((State / Region) * Purpose)
tourism_structure
#> <gig_hierarchy> (State/Region)*Purpose
#>   keys: State, Region, Purpose
```

## Feature space

The feature-space plot displays each series as one point, positioned by
two features of the series. The features are computed with
[`fabletools::features()`](https://fabletools.tidyverts.org/reference/features.html).
Here
[`feat_stl()`](https://feasts.tidyverts.org/reference/feat_stl.html)
gives the strength of trend and seasonality, together with several other
features of the STL decomposition.

``` r

tourism_features <- tourism_hts |>
  features(Trips, feat_stl)

gig(
  tourism_features,
  gig_aes(x = trend_strength, y = seasonal_strength_year)
) +
  geom_features() +
  tourism_structure
```

The `x` and `y` aesthetics set the initial axes. Any other numeric
column of the data can be chosen from the menu on either axis. Points
are coloured by their level in the aggregation structure, and selecting
a node in the hierarchy widget highlights the corresponding series.

## STL decomposition

The STL plot displays the observed series together with its trend,
seasonal and remainder components. The components are computed with
[`feasts::STL()`](https://feasts.tidyverts.org/reference/STL.html). The
`trend`, `seasonality` and `remainder` aesthetics must be mapped
explicitly, so that no component is guessed from a column name.

``` r

tourism_stl <- tourism_hts |>
  model(stl = STL(Trips)) |>
  components()

gig(
  tourism_stl,
  gig_aes(
    x = Quarter, y = Trips, trend = trend,
    seasonality = season_year, remainder = remainder
  )
) +
  geom_stl() +
  tourism_structure
```

Series at different levels of the structure differ greatly in scale. The
`scaled` argument of
[`geom_stl()`](https://yvesypher.github.io/ggelato/reference/geom_stl.md)
accepts a second table of components computed from standardised series,
and the toolbar then switches between the original and the standardised
scale.

``` r

tourism_stl_scaled <- tourism_hts |>
  group_by_key() |>
  dplyr::mutate(Trips = as.numeric(scale(Trips))) |>
  dplyr::ungroup() |>
  model(stl = STL(Trips)) |>
  components()

gig(
  tourism_stl,
  gig_aes(
    x = Quarter, y = Trips, trend = trend,
    seasonality = season_year, remainder = remainder
  )
) +
  geom_stl(scaled = tourism_stl_scaled) +
  tourism_structure
```

## Sunburst

The sunburst displays the aggregation structure itself. Each ring
corresponds to one level of the structure, and each segment to one node
at that level. Any table that contains the key columns of the aggregated
and bottom-level series can be used, such as the table of features
computed above.

``` r

gig(tourism_features) +
  geom_sunburst() +
  tourism_structure
```

Segment labels can be switched off initially with
`geom_sunburst(labels = FALSE)` and toggled from the toolbar.

## The hierarchy widget in existing plots

The hierarchy widget can also be added to line plots made with
[`plotly::ggplotly()`](https://rdrr.io/pkg/plotly/man/ggplotly.html) or
with highcharter, through
[`add_hierarchy_plotly()`](https://yvesypher.github.io/ggelato/reference/add_hierarchy_plotly.md)
and
[`add_hierarchy_hc()`](https://yvesypher.github.io/ggelato/reference/add_hierarchy_hc.md)
respectively. The plot must identify the key values of each series, as
described in the help pages of these functions. The example below adds
the widget to a highcharter plot.

``` r

library(highcharter)
#> Registered S3 method overwritten by 'quantmod':
#>   method            from
#>   as.zoo.data.frame zoo
#> Highcharts (www.highcharts.com) is a Highsoft software product which is
#> not free for commercial and Governmental use

tourism_lines <- data.frame(
  Quarter = as.numeric(as.Date(tourism_hts$Quarter)),
  State = as.character(tourism_hts$State),
  Region = as.character(tourism_hts$Region),
  Purpose = as.character(tourism_hts$Purpose),
  Trips = tourism_hts$Trips
)

highchart() |>
  hc_add_series(
    tourism_lines,
    type = "line",
    hcaes(x = Quarter, y = Trips, group = interaction(State, Region, Purpose))
  ) |>
  add_hierarchy_hc("(State/Region)*Purpose")
```

## Saving plots and using them in Shiny

A `gig` plot is drawn when it is printed.
[`gig_build()`](https://yvesypher.github.io/ggelato/reference/gig_build.md)
returns the underlying htmlwidget, which can be saved as a standalone
web page with
[`htmlwidgets::saveWidget()`](https://rdrr.io/pkg/htmlwidgets/man/saveWidget.html).
Each geom layer has a pair of Shiny functions, such as
[`geom_featuresOutput()`](https://yvesypher.github.io/ggelato/reference/geom_features-shiny.md)
and
[`renderGeomFeatures()`](https://yvesypher.github.io/ggelato/reference/geom_features-shiny.md).

``` r

library(shiny)

ui <- fluidPage(geom_featuresOutput("features", height = "600px"))

server <- function(input, output, session) {
  output$features <- renderGeomFeatures(
    gig(
      tourism_features,
      gig_aes(x = trend_strength, y = seasonal_strength_year)
    ) +
      geom_features() +
      tourism_structure
  )
}

shinyApp(ui, server)
```

## Coordinating several views

A [`gig()`](https://yvesypher.github.io/ggelato/reference/gig.md) plot
contains a single geom layer. Several plots of the same data can be
displayed together with the `fridge` package, which arranges them as
movable windows that share one hierarchy widget and one selection.
