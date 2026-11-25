# Coerce a structure string to a gig_hierarchy

Allows functions, including `fridge::fridge()`, to accept either a
string or a
[`hierarchy()`](https://yvesypher.github.io/ggelato/reference/hierarchy.md)
object.

## Usage

``` r
as_gig_hierarchy(x)
```

## Arguments

- x:

  A string or a `gig_hierarchy`.

## Value

A `gig_hierarchy`, or `NULL` if `x` is `NULL`.

## Examples

``` r
as_gig_hierarchy("(State/Region)*Purpose")
#> <gig_hierarchy> (State/Region)*Purpose
#>   keys: State, Region, Purpose
```
