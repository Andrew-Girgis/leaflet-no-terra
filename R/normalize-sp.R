# Typically, this will work on Spatial* objects, but will fail with sp::Polygons / sp::Lines etc.
# https://r-spatial.github.io/sf/reference/st_as_sf.html#ref-examples
maybe_as_sf <- function(data) {
  tryCatch(
    {
      data <- sf::st_as_sf(data)
    },
    error = function(e) {
      rlang::warn(c(
        "Couldn't transform the sp object to sf.\nConsider using recreating objects with the sf package.",
        paste0("Objects of type ", class(data), "may not be handled well by sf.")
        ),
        .frequency_id = "sp-sf-conversion-leaflet",
        .frequency = "once",
        parent = e
     )
  })
  data
}

# metaData (no longer used due to conversion to sf) ----------------------------

#' @export
metaData.SpatialPointsDataFrame <- function(obj) obj@data
#' @export
metaData.SpatialLinesDataFrame <- function(obj) obj@data
#' @export
metaData.SpatialPolygonsDataFrame <- function(obj) obj@data

# pointData (no longer used due to conversion to sf) -------------------------

#' @export
pointData.SpatialPoints <- function(obj) {
  sp_coords(obj)
}

#' @export
pointData.SpatialPointsDataFrame <- function(obj) {
  sp_coords(obj)
}


# polygonData -------------------------------------------------------------

polygonData_sp <- function(obj) {
  structure(
    to_multipolygon_list(obj),
    bbox = sp_bbox(obj)
  )
}

#' @export
polygonData.Polygon <- polygonData_sp
#' @export
polygonData.Polygons <- polygonData_sp

# No longer used due to conversion to sf
#' @export
polygonData.SpatialPolygons <- polygonData_sp

# No longer used due to conversion to sf
#' @export
polygonData.SpatialPolygonsDataFrame <- function(obj) {
  if (length(obj@polygons) > 0) {
    polygonData(sp::polygons(obj))
  } else {
    warning("Empty SpatialPolygonsDataFrame object passed and will be skipped")
    structure(list(), bbox = obj@bbox)
  }
}

#' @export
polygonData.Line <- polygonData_sp
#' @export
polygonData.Lines <- polygonData_sp

# No longer used due to conversion to sf
#' @export
polygonData.SpatialLines <- polygonData_sp

# No longer used due to conversion to sf
#' @export
polygonData.SpatialLinesDataFrame <- function(obj) {
  if (length(obj@lines) > 0) {
    polygonData(sp::SpatialLines(obj@lines))
  } else {
    warning("Empty SpatialLinesDataFrame object passed and will be skipped")
    structure(list(), bbox = obj@bbox)
  }
}

# Helpers -----------------------------------------------------------------

sp_coords <- function(x) {
  structure(
    as.data.frame(sp::coordinates(x)),
    names = c("lng", "lat")
  )
}

# Converters --------------------------------------------------------------

sp_bbox <- function(x) {
  bbox <- sp::bbox(x)
  colnames(bbox) <- NULL
  rownames(bbox) <- c("lng", "lat")
  bbox
}

# No longer used due to conversion to sf
#' @export
to_multipolygon_list.SpatialPolygons <- function(x) {
  lapply(x@polygons, to_multipolygon)
}

#' @export
to_multipolygon.Polygons <- function(x) {
  pgons <- x
  if (length(pgons@Polygons) > 1) {
    # If Polygons contains more than one Polygon, then we may be dealing with
    # a polygon with holes or a multipolygon (potentially with holes). We used
    # to use rgeos::createPolygonsComment, but rgeos has been deprecated, so now
    # we use sf.
    comment <- comment(pgons)
    if (is.null(comment) || comment == "FALSE") {
      if (any(vapply(pgons@Polygons, methods::slot, logical(1), "hole"))) {
        if (!requireNamespace("sf")) {
          stop("You attempted to use an sp Polygons object that is missing hole ",
               "information. Leaflet can use the {sf} package to infer hole ",
               "assignments, but it is not installed. Please install the {sf} ",
               "package, and try the operation again.")
        } else if (packageVersion("sf") < "1.0.10") {
          stop("You attempted to use an sp Polygons object that is missing hole ",
               "information. Leaflet can use the {sf} package to infer hole ",
               "assignments, but only with sf v1.0-10 and above. Please upgrade ",
               "the {sf} package, and try the operation again.")
        }
        x <- to_multipolygon_list(sf::st_geometry(sf::st_as_sf(sp::SpatialPolygons(list(pgons)))))
        return(x[[1]])
      } else {
        comment <- paste(collapse = " ", rep_len("0", length(pgons@Polygons)))
      }
    }
    pstatus <- as.integer(strsplit(comment, " ")[[1]])
    lapply(which(pstatus == 0L), function(index) {
      # Return a list of rings, exterior first
      c(
        list(to_ring(pgons@Polygons[[index]])),  # exterior
        lapply(pgons@Polygons[pstatus == index], to_ring)  # holes, if any
      )
    })
  } else {
    to_multipolygon(pgons@Polygons[[1]])
  }
}

#' @export
to_ring.Polygon <- function(x) {
  sp_coords(x)
}

# No longer used due to conversion to sf
#' @export
to_multipolygon_list.SpatialLines <- function(x) {
  lapply(x@lines, to_multipolygon)
}

#' @export
to_multipolygon.Lines <- function(x) {
  lapply(x@Lines, to_polygon)
}

#' @export
to_ring.Line <- function(x) {
  sp_coords(x)
}
