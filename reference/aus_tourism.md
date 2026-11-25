# Australian domestic overnight trips, 1998 Q1 to 2022 Q4

Quarterly overnight trips (in thousands) for the 76 tourism regions of
Australia, disaggregated by purpose of travel. The data extend
[`tsibble::tourism`](https://tsibble.tidyverts.org/reference/tourism.html)
to 2022 Q4 and map the earlier region names to the revised tourism
region boundaries, so that every bottom-level series spans the full 100
quarters. Together with the purpose of travel, the regions form the
grouped structure `(State / Region) * Purpose`, in which regions are
nested within states and purpose is crossed with both.

## Usage

``` r
aus_tourism
```

## Format

A `tsibble` with 30,400 rows and 5 columns, keyed by `State`, `Region`
and `Purpose` and indexed by `Quarter`.

- Quarter:

  Year-quarter of the trips.

- State:

  State or territory.

- Region:

  Tourism region.

- Purpose:

  Purpose of travel, one of "Business", "Holiday", "Visiting" (visiting
  friends and relatives) and "Other".

- Trips:

  Overnight trips, in thousands.

## Source

Tourism Research Australia, National Visitor Survey. The script that
builds the data is in the `data-raw` directory of the source repository.

## Examples

``` r
aus_tourism
#> # A tsibble: 30,400 x 5 [1Q]
#> # Key:       State, Region, Purpose [304]
#>    Quarter State Region   Purpose  Trips
#>      <qtr> <chr> <chr>    <chr>    <dbl>
#>  1 1998 Q1 ACT   Canberra Business 150. 
#>  2 1998 Q2 ACT   Canberra Business  99.9
#>  3 1998 Q3 ACT   Canberra Business 130. 
#>  4 1998 Q4 ACT   Canberra Business 102. 
#>  5 1999 Q1 ACT   Canberra Business  95.5
#>  6 1999 Q2 ACT   Canberra Business 229. 
#>  7 1999 Q3 ACT   Canberra Business 109. 
#>  8 1999 Q4 ACT   Canberra Business 159. 
#>  9 2000 Q1 ACT   Canberra Business 105. 
#> 10 2000 Q2 ACT   Canberra Business 202. 
#> # ℹ 30,390 more rows
```
