# Build `aus_tourism`: quarterly overnight trips, 1998 Q1 to 2022 Q4.
#
# `tsibble::tourism` covers 1998 Q1 to 2017 Q4. `tourism_new.rda` holds the
# 2018 Q1 to 2022 Q4 release from Tourism Research Australia, which uses the
# revised tourism region boundaries. Earlier region names are mapped to the
# revised names, and the pooled "Central Queensland" series is split into its
# three successor regions using their 2018-2022 shares within each purpose.

library(dplyr)
library(tsibble)

load("data-raw/tourism_new.rda")

new_name <- c(
  "Experience Perth"                = "Destination Perth",
  "Launceston, Tamar and the North" = "Launceston and the North",
  "Wilderness West"                 = "West Coast",
  "Northern"                        = "Townsville",
  "Outback"                         = "Outback Queensland",
  "Kakadu Arnhem"                   = "Litchfield Kakadu Arnhem",
  "Murraylands"                     = "Murray River, Lakes and Coorong",
  "Melbourne East"                  = "Yarra Valley and Dandenong Ranges",
  "Upper Yarra"                     = "Yarra Valley and Dandenong Ranges",
  "Darling Downs"                   = "Central Queensland"
)
successor_regions <- c("Capricorn Coast", "Gladstone", "Queensland Country")

tourism_combined <- bind_rows(tsibble::tourism, tourism_new) |>
  as_tibble() |>
  mutate(Region = recode(Region, !!!new_name)) |>
  summarise(Trips = sum(Trips), .by = c(Quarter, State, Region, Purpose))

region_share <- tourism_combined |>
  filter(Region %in% successor_regions) |>
  summarise(share = sum(Trips), .by = c(Region, Purpose)) |>
  mutate(share = share / sum(share), .by = Purpose)

central_qld_split <- tourism_combined |>
  filter(Region == "Central Queensland") |>
  select(-Region) |>
  inner_join(region_share, by = "Purpose", relationship = "many-to-many") |>
  mutate(Trips = Trips * share, share = NULL)

aus_tourism <- tourism_combined |>
  filter(Region != "Central Queensland") |>
  bind_rows(central_qld_split) |>
  summarise(Trips = sum(Trips), .by = c(Quarter, State, Region, Purpose)) |>
  arrange(State, Region, Purpose, Quarter) |>
  as_tsibble(index = Quarter, key = c(State, Region, Purpose))

usethis::use_data(aus_tourism, overwrite = TRUE, compress = "xz")
