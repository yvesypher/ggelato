#' Australian domestic overnight trips, 1998 Q1 to 2022 Q4
#'
#' Quarterly overnight trips (in thousands) for the 76 tourism regions of
#' Australia, disaggregated by purpose of travel. The data extend
#' `tsibble::tourism` to 2022 Q4 and map the earlier region names to the
#' revised tourism region boundaries, so that every bottom-level series spans
#' the full 100 quarters. Together with the purpose of travel, the regions form
#' the grouped structure `(State / Region) * Purpose`, in which regions are
#' nested within states and purpose is crossed with both.
#'
#' @format A `tsibble` with 30,400 rows and 5 columns, keyed by `State`,
#'   `Region` and `Purpose` and indexed by `Quarter`.
#' \describe{
#'   \item{Quarter}{Year-quarter of the trips.}
#'   \item{State}{State or territory.}
#'   \item{Region}{Tourism region.}
#'   \item{Purpose}{Purpose of travel, one of "Business", "Holiday",
#'     "Visiting" (visiting friends and relatives) and "Other".}
#'   \item{Trips}{Overnight trips, in thousands.}
#' }
#' @source Tourism Research Australia, National Visitor Survey. The script
#'   that builds the data is in the `data-raw` directory of the source
#'   repository.
#' @examples
#' aus_tourism
"aus_tourism"
