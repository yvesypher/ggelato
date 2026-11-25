# Aggregation structure of a hierarchical or grouped time series

Wraps an aggregation structure, written as in
[`fabletools::aggregate_key()`](https://fabletools.tidyverts.org/reference/aggregate_key.html),
in an object that can be added to any
[`gig()`](https://yvesypher.github.io/ggelato/reference/gig.md) plot
with `+`. The operator `/` denotes nesting (parent / child) and `*`
denotes crossing of independent groupings. A single `hierarchy()` object
can be shared by several plots of the same data.

## Usage

``` r
hierarchy(structure)
```

## Arguments

- structure:

  The aggregation structure, either as a bare expression,
  `(State / Region) * Purpose`, or as a string,
  `"(State/Region)*Purpose"`. A variable holding such a string is also
  accepted.

## Value

An object of class `gig_hierarchy`.

## See also

[`gig()`](https://yvesypher.github.io/ggelato/reference/gig.md)

## Examples

``` r
hierarchy((State / Region) * Purpose)
#> <gig_hierarchy> (State/Region)*Purpose
#>   keys: State, Region, Purpose
hierarchy("(State/Region)*Purpose")
#> <gig_hierarchy> (State/Region)*Purpose
#>   keys: State, Region, Purpose

# One structure object can be added to several plots
tourism_structure <- hierarchy((State / Region) * Purpose)
plot_spec <- gig(aus_tourism) + geom_sunburst() + tourism_structure
plot_spec$hierarchy
#> <gig_hierarchy> (State/Region)*Purpose
#>   keys: State, Region, Purpose
```
