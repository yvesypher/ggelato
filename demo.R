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

p1 <- ggplotly(p, tooltip = "text") |> layout(margin = list(r = 150))

add_hierarchy(p1, "(State/Region)*Purpose")

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
  hc_add_series(data = agg_tourism,
                type = "line",
                hcaes(x = Quarter,
                      y = Trips,
                      group = interaction(State, Region, Purpose)))

add_hierarchy_hc(
  tourism_hc_plot,
  "(State/Region)*Purpose"
)


##########

w <- add_hierarchy(p1, "(State/Region)*Purpose")

deps <- htmltools::findDependencies(w)

lapply(deps, function(d) {
  list(
    name = d$name,
    version = d$version,
    src = d$src,
    script = d$script
  )
})

dep <- deps[[which(grepl("hierarchy|add", vapply(deps, function(d) d$name, character(1)), ignore.case = TRUE))[1]]]

script <- dep$script
if (is.list(script)) {
  script <- if (is.list(script[[1]])) script[[1]]$src else script[[1]]
}

served_js <- file.path(dep$src$file, script)

normalizePath(served_js)

grep(
  "e9c46a|4169E1|DEPTH_COLORS",
  readLines(served_js, warn = FALSE),
  value = TRUE,
  ignore.case = TRUE
)
