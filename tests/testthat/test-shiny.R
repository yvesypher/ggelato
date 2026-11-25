test_that("render functions accept gig specifications in Shiny", {
  skip_if_not_installed("shiny")

  plot_spec <- gig(aus_tourism, structure = (State / Region) * Purpose) +
    geom_sunburst()

  server <- function(input, output, session) {
    output$structure <- renderGeomSunburst(plot_spec)
  }

  shiny::testServer(server, {
    expect_match(output$structure, "(State/Region)*Purpose", fixed = TRUE)
  })
})
