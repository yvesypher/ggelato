# Coerce a data frame so it serialises cleanly to the JS side:
#  - agg_vec / factor / yearquarter / etc. columns become character
#    (so "<aggregated>" markers survive as strings)
#  - numeric columns are left untouched
prep_gig_data <- function(data) {
  data <- as.data.frame(data)
  for (nm in names(data)) {
    col <- data[[nm]]
    if (!is.numeric(col) && !is.character(col)) {
      data[[nm]] <- format(col)
    }
  }
  data
}
