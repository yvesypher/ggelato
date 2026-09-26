packer::bundle()
devtools::load_all()
library(ggelato)

library(tsibble)
library(feasts)
library(fable)
library(tidyverse)

library(plotly)
library(htmltools)
library(htmlwidgets)
library(highcharter)

### Tourism data
agg_tourism <- tourism |>
  aggregate_key((State/Region)*Purpose, Trips = sum(Trips)) |>
  mutate(across(c(State, Region, Purpose), as.character))

agg_tourism_s <- tourism |>
  aggregate_key((State / Region)*Purpose, Trips = sum(Trips)) |>
  group_by_key() |>
  mutate(
    Trips = (Trips - mean(Trips, na.rm = TRUE)) /
      sd(Trips, na.rm = TRUE)
  ) |>
  ungroup() |>
  mutate(across(c(State, Region, Purpose), as.character))

p <- agg_tourism |>
  ggplot(aes(x = Quarter,
             y = Trips,
             group = interaction(State, Region, Purpose),
             text = paste(
               "Quarter:", Quarter,
               "<br>Trips:", Trips,
               "<br>State:", State,
               "<br>Region:", Region,
               "<br>Purpose:", Purpose)
             )
         ) +
  geom_line()

p1 <- ggplotly(p, tooltip = "text")

add_hierarchy_plotly(p1, "(State/Region)*Purpose")

### Prison data

# load("data/prisonLF.rda")

prison <- prisonLF |>
  mutate(Quarter = yearquarter(t)) |>
  select(-t)  |>
  as_tsibble(key = c(gender, legal, state),
             index = Quarter) |>
  relocate(Quarter)

prison_gts <- prison |>
  aggregate_key(gender * legal * state, count = sum(count))

prison_plot <- prison_gts |>
  ggplot(aes(x = Quarter,
             y = count,
             group = interaction(gender, legal, state),
             text = paste(
               "Quarter:", Quarter,
               "<br>Count:", count,
               "<br>Gender:", gender,
               "<br>Legal:", legal,
               "<br>State:", state)
  )
  ) +
  geom_line()

prison_plotly <- ggplotly(prison_plot, tooltip = "text") |> layout(margin = list(r = 150))

add_hierarchy(prison_plotly, "gender*legal*state")

#### highchart ####

tourism_hc_plot <- highchart() |>
  hc_add_series(
    data = agg_tourism |>
      tibble::as_tibble() |>
      dplyr::mutate(Quarter = as.numeric(as.Date(Quarter))),
    type = "line",
    hcaes(x = Quarter, y = Trips, group = interaction(State, Region, Purpose))
  )

add_hierarchy_hc(
  tourism_hc_plot,
  "(State/Region)*Purpose"
)

#### dummy data #####
#
# locations <- tibble::tribble(
#   ~Country,       ~State,              ~Region,
#   "Australia",    "Victoria",           "Melbourne",
#   "Australia",    "Victoria",           "Geelong",
#   "Australia",    "New South Wales",    "Sydney",
#   "Australia",    "New South Wales",    "Newcastle",
#   "New Zealand",  "North Island",       "Auckland",
#   "New Zealand",  "North Island",       "Wellington",
#   "New Zealand",  "South Island",       "Christchurch",
#   "New Zealand",  "South Island",       "Dunedin"
# )
#
# quarters <- yearquarter(
#   seq(
#     as.Date("2022-01-01"),
#     by = "quarter",
#     length.out = 20
#   )
# )
#
# # Generate bottom-level series
# dummy_data <- locations |>
#   tidyr::crossing(
#     Purpose = c("Business", "Holiday"),
#     Channel = c("Online", "Agent"),
#     Quarter = quarters
#   ) |>
#   group_by(Country, State, Region, Purpose, Channel) |>
#   arrange(Quarter) |>
#   mutate(
#     time = row_number(),
#     region_effect = as.numeric(factor(Region)) * 60,
#     purpose_effect = if_else(Purpose == "Holiday", 250, 0),
#     channel_effect = if_else(Channel == "Online", 120, 0),
#     Trips = round(
#       800 +
#         region_effect +
#         purpose_effect +
#         channel_effect +
#         12 * time +
#         150 * sin(2 * pi * time / 4) +
#         rnorm(n(), mean = 0, sd = 60)
#     )
#   ) |>
#   ungroup() |>
#   select(Country, State, Region, Purpose, Channel, Quarter, Trips) |>
#   as_tsibble(
#     index = Quarter,
#     key = c(Country, State, Region, Purpose, Channel)
#   )
#
# dummy_agg <- dummy_data |>
#   aggregate_key((State/Region)*Purpose*Channel, Trips = sum(Trips)) |>
#   mutate(across(c(State, Region, Purpose, Channel), as.character))
#
#
# dummy_p <- dummy_agg |>
#   ggplot(aes(x = Quarter,
#              y = Trips,
#              group = interaction(State, Region, Purpose, Channel),
#              text = paste(
#                "Quarter:", Quarter,
#                "<br>Trips:", Trips,
#                "<br>State:", State,
#                "<br>Region:", Region,
#                "<br>Purpose:", Purpose,
#                "<br>Channel:", Channel)
#   )
#   ) +
#   geom_line()
#
# dummy_p1 <- ggplotly(dummy_p, tooltip = "text") |> layout(margin = list(r = 150))
#
# add_hierarchy(dummy_p1, "(State/Region)*Purpose*Channel")


####### STL Decompostion #######

tourism_ft <- tourism |>
  aggregate_key((State / Region)*Purpose, Trips = sum(Trips)) |>
  features(Trips, feature_set(pkgs = "feasts")) |>
  mutate(State = as.character(State), Region = as.character(Region), Purpose = as.character(Purpose)) |>
  as.data.frame()

tourism_agg <- tourism_ft |>
  filter(State == "<aggregated>" | Region == "<aggregated>")

stl_u <- tourism |>
  aggregate_key((State / Region)*Purpose, Trips = sum(Trips)) |>
  model(STL(Trips ~ season(window = "periodic"))) |>
  components() |>
  as.data.frame() |>
  select(State, Region, Purpose, Quarter, Trips, trend, season_year, remainder) |>
  mutate(
    State = as.character(State),
    Region = as.character(Region),
    Purpose = as.character(Purpose),
    Quarter = as.character(Quarter)
  )

stl_s <- tourism |>
  aggregate_key((State / Region)*Purpose, Trips = sum(Trips)) |>
  group_by_key() |>
  mutate(Trips = (Trips - mean(Trips)) / sd(Trips)) |>
  model(STL(Trips ~ season(window = "periodic"))) |>
  components() |>
  as.data.frame() |>
  select(State, Region, Purpose, Quarter, Trips, trend, season_year, remainder) |>
  mutate(
    State = as.character(State),
    Region = as.character(Region),
    Purpose = as.character(Purpose),
    Quarter = as.character(Quarter)
  )

gig_stldp(data = stl_u,
          scaled = stl_s,
          structure = "(State/Region)*Purpose",
          time = "Quarter", value = "Trips")

gig(stl_u, gig_aes(x = Quarter, y = Trips)) +
  geom_gig_stl(scaled = stl_s) +
  hierarchy((State / Region) * Purpose)

##### sunburst ####

tourism_hts <- tourism |>
  aggregate_key((State / Region) * Purpose,
                Trips = sum(Trips)) |>
  mutate(across(c(State, Region, Purpose),
                as.character))

gig_sunburst(tourism_hts,
             structure = "(State/Region)*Purpose",
             labels    = TRUE)


gig(tourism_hts) +
  geom_gig_sunburst(labels = TRUE) +
  hierarchy((State / Region) * Purpose)

tourism_ft <- tourism |>
  aggregate_key((State / Region)*Purpose,
                Trips = sum(Trips)) |>
  features(Trips, feature_set(pkgs = "feasts")) |>
  mutate(across(c(State, Region, Purpose),
                as.character)) |>
  as.data.frame()

gig(tourism_ft) +
  geom_gig_point() +
  hierarchy((State / Region) * Purpose)

gig_point(data = tourism_ft,
          structure = "(State/Region)*Purpose")


tourism |>
  aggregate_key((State / Region) * Purpose,
                Trips = sum(Trips))  |> filter(is_aggregated(State), !is_aggregated(Purpose))


tourism_sunburst <- gig(as_tibble(tourism_hts),
                        structure = (State/Region)*Purpose) +
  geom_sunburst(labels = TRUE)

tourism_sunburst

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

fridge(tourism_stl,
       tourism_feasts,
       tourism_sunburst,
       fullscreen = FALSE)
