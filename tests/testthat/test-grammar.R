test_that("hierarchy() accepts expressions and strings", {
  from_expression <- hierarchy((State / Region) * Purpose)
  from_string <- hierarchy("(State/Region)*Purpose")

  expect_s3_class(from_expression, "gig_hierarchy")
  expect_identical(from_expression$structure, from_string$structure)
  expect_identical(from_expression$keys, c("State", "Region", "Purpose"))
})

test_that("gig_aes() drops NULL aesthetics", {
  mapping <- gig_aes(x = trend_strength, y = NULL)
  expect_identical(names(mapping), "x")
})

test_that("components are added with +", {
  plot_spec <- gig(aus_tourism) +
    geom_sunburst() +
    hierarchy((State / Region) * Purpose)

  expect_length(plot_spec$layers, 1L)
  expect_identical(plot_spec$hierarchy$structure, "(State/Region)*Purpose")
})

test_that("gig_build() returns the matching htmlwidget", {
  widget <- gig_build(
    gig(aus_tourism, structure = (State / Region) * Purpose) + geom_sunburst()
  )
  expect_s3_class(widget, "gig_sunburst")
})

test_that("gig_build() reports missing or extra layers", {
  expect_error(gig_build(gig(aus_tourism)), "Add a geom layer")
  expect_error(
    gig_build(gig(aus_tourism) + geom_sunburst() + geom_sunburst()),
    "Only one geom"
  )
  expect_error(gig_build(gig(aus_tourism) + geom_sunburst()), "structure")
})

test_that("geom_stl() requires explicit STL components", {
  plot_spec <- gig(aus_tourism, gig_aes(x = Quarter, y = Trips)) + geom_stl()
  expect_error(gig_build(plot_spec), "trend")
})
