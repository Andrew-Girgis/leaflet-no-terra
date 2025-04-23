import $ from "./global/jquery";
import L from "./global/leaflet";
import Shiny from "./global/shiny";
import HTMLWidgets from "./global/htmlwidgets";

import { asArray } from "./util";
import { getCRS } from "./crs_utils";

import DataFrame from "./dataframe";
import ClusterLayerStore from "./cluster-layer-store";
import Mipmapper from "./mipmapper";

let methods = {};
export default methods;


function mouseHandler(mapId, layerId, group, eventName, extraInfo) {
  return function(e) {
    if (!HTMLWidgets.shinyMode) return;

    let latLng = e.target.getLatLng ? e.target.getLatLng() : e.latlng;
    if (latLng) {
      // retrieve only lat, lon values to remove prototype
      //   and extra parameters added by 3rd party modules
      // these objects are for json serialization, not javascript
      let latLngVal = L.latLng(latLng); // make sure it has consistent shape
      latLng = {lat: latLngVal.lat, lng: latLngVal.lng};
    }
    let eventInfo = $.extend(
      {
        id: layerId,
        ".nonce": Math.random()  // force reactivity
      },
      group !== null ? {group: group} : null,
      latLng,
      extraInfo
    );

    Shiny.onInputChange(mapId + "_" + eventName, eventInfo);
  };
}

methods.mouseHandler = mouseHandler;

methods.clearGroup = function(group) {
  $.each(asArray(group), (i, v) => {
    this.layerManager.clearGroup(v);
  });
};

methods.setView = function(center, zoom, options) {
  this.setView(center, zoom, options);
};

methods.fitBounds = function(lat1, lng1, lat2, lng2, options) {
  this.fitBounds([
    [lat1, lng1], [lat2, lng2]
  ], options);
};

methods.flyTo = function(center, zoom, options) {
  this.flyTo(center, zoom, options);
};

methods.flyToBounds = function(lat1, lng1, lat2, lng2, options) {
  this.flyToBounds([
    [lat1, lng1], [lat2, lng2]
  ], options);
};


methods.setMaxBounds = function(lat1, lng1, lat2, lng2) {
  this.setMaxBounds([
    [lat1, lng1], [lat2, lng2]
  ]);
};

methods.addPopups = function(lat, lng, popup, layerId, group, options) {
  let df = new DataFrame()
    .col("lat", lat)
    .col("lng", lng)
    .col("popup", popup)
    .col("layerId", layerId)
    .col("group", group)
    .cbind(options);

  for (let i = 0; i < df.nrow(); i++) {
    if($.isNumeric(df.get(i, "lat")) && $.isNumeric(df.get(i, "lng"))) {
      (function() {
        let popup =
          L
            .popup(df.get(i))
            .setLatLng([df.get(i, "lat"), df.get(i, "lng")])
            .setContent(df.get(i, "popup"));
        let thisId = df.get(i, "layerId");
        let thisGroup = df.get(i, "group");
        this.layerManager.addLayer(popup, "popup", thisId, thisGroup);
      }).call(this);
    }
  }
};

methods.removePopup = function(layerId) {
  this.layerManager.removeLayer("popup", layerId);
};

methods.clearPopups = function() {
  this.layerManager.clearLayers("popup");
};

methods.addTiles = function(urlTemplate, layerId, group, options) {
  this.layerManager.addLayer(L.tileLayer(urlTemplate, options), "tile", layerId, group);
};

methods.removeTiles = function(layerId) {
  this.layerManager.removeLayer("tile", layerId);
};

methods.clearTiles = function() {
  this.layerManager.clearLayers("tile");
};

methods.addWMSTiles = function(baseUrl, layerId, group, options) {
  if(options && options.crs) {
    options.crs = getCRS(options.crs);
  }
  this.layerManager.addLayer(L.tileLayer.wms(baseUrl, options), "tile", layerId, group);
};

// Given:
//   {data: ["a", "b", "c"], index: [0, 1, 0, 2]}
// returns:
//   ["a", "b", "a", "c"]
function unpackStrings(iconset) {
  if (!iconset) {
    return iconset;
  }
  if (typeof(iconset.index) === "undefined") {
    return iconset;
  }

  iconset.data = asArray(iconset.data);
  iconset.index = asArray(iconset.index);

  return $.map(iconset.index, function(e, i) {
    return iconset.data[e];
  });
}

function addMarkers(map, df, group, clusterOptions, clusterId, markerFunc) {
  (function() {
    let clusterGroup = this.layerManager.getLayer("cluster", clusterId),
      cluster = clusterOptions !== null;
    if (cluster && !clusterGroup) {
      clusterGroup = L.markerClusterGroup.layerSupport(clusterOptions);
      if(clusterOptions.freezeAtZoom) {
        let freezeAtZoom = clusterOptions.freezeAtZoom;
        delete clusterOptions.freezeAtZoom;
        clusterGroup.freezeAtZoom(freezeAtZoom);
      }
      clusterGroup.clusterLayerStore = new ClusterLayerStore(clusterGroup);
    }
    let extraInfo = cluster ? { clusterId: clusterId } : {};

    for (let i = 0; i < df.nrow(); i++) {
      if($.isNumeric(df.get(i, "lat")) && $.isNumeric(df.get(i, "lng"))) {
        (function() {
          let marker = markerFunc(df, i);
          let thisId = df.get(i, "layerId");
          let thisGroup = cluster ? null : df.get(i, "group");
          if (cluster) {
            clusterGroup.clusterLayerStore.add(marker, thisId);
          } else {
            this.layerManager.addLayer(marker, "marker", thisId, thisGroup, df.get(i, "ctGroup", true), df.get(i, "ctKey", true));
          }
          let popup = df.get(i, "popup");
          let popupOptions = df.get(i, "popupOptions");
          if (popup !== null) {
            if (popupOptions !== null){
              marker.bindPopup(popup, popupOptions);
            } else {
              marker.bindPopup(popup);
            }
          }
          let label = df.get(i, "label");
          let labelOptions = df.get(i, "labelOptions");
          if (label !== null) {
            if (labelOptions !== null) {
              if(labelOptions.permanent) {
                marker.bindTooltip(label, labelOptions).openTooltip();
              } else {
                marker.bindTooltip(label, labelOptions);
              }
            } else {
              marker.bindTooltip(label);
            }
          }
          marker.on("click", mouseHandler(this.id, thisId, thisGroup, "marker_click", extraInfo), this);
          marker.on("mouseover", mouseHandler(this.id, thisId, thisGroup, "marker_mouseover", extraInfo), this);
          marker.on("mouseout", mouseHandler(this.id, thisId, thisGroup, "marker_mouseout", extraInfo), this);
          marker.on("dragend", mouseHandler(this.id, thisId, thisGroup, "marker_dragend", extraInfo), this);
        }).call(this);
      }
    }

    if (cluster) {
      this.layerManager.addLayer(clusterGroup, "cluster", clusterId, group);
    }
  }).call(map);
}

methods.addGenericMarkers = addMarkers;

methods.addMarkers = function(
  lat, lng, icon, layerId, group, options, popup, popupOptions,
  clusterOptions, clusterId, label, labelOptions, crosstalkOptions
) {
  let icondf;
  let getIcon;

  if (icon) {
    // Unpack icons
    icon.iconUrl         = unpackStrings(icon.iconUrl);
    icon.iconRetinaUrl   = unpackStrings(icon.iconRetinaUrl);
    icon.shadowUrl       = unpackStrings(icon.shadowUrl);
    icon.shadowRetinaUrl = unpackStrings(icon.shadowRetinaUrl);

    // This cbinds the icon URLs and any other icon options; they're all
    // present on the icon object.
    icondf = new DataFrame().cbind(icon);

    // Constructs an icon from a specified row of the icon dataframe.
    getIcon = function(i) {
      let opts = icondf.get(i);
      if (!opts.iconUrl) {
        return new L.Icon.Default();
      }

      // Composite options (like points or sizes) are passed from R with each
      // individual component as its own option. We need to combine them now
      // into their composite form.
      if (opts.iconWidth) {
        opts.iconSize = [opts.iconWidth, opts.iconHeight];
      }
      if (opts.shadowWidth) {
        opts.shadowSize = [opts.shadowWidth, opts.shadowHeight];
      }
      if (opts.iconAnchorX) {
        opts.iconAnchor = [opts.iconAnchorX, opts.iconAnchorY];
      }
      if (opts.shadowAnchorX) {
        opts.shadowAnchor = [opts.shadowAnchorX, opts.shadowAnchorY];
      }
      if (opts.popupAnchorX) {
        opts.popupAnchor = [opts.popupAnchorX, opts.popupAnchorY];
      }

      return new L.Icon(opts);
    };
  }

  if(!($.isEmptyObject(lat) || $.isEmptyObject(lng)) ||
      ($.isNumeric(lat) && $.isNumeric(lng))) {

    let df = new DataFrame()
      .col("lat", lat)
      .col("lng", lng)
      .col("layerId", layerId)
      .col("group", group)
      .col("popup", popup)
      .col("popupOptions", popupOptions)
      .col("label", label)
      .col("labelOptions", labelOptions)
      .cbind(options)
      .cbind(crosstalkOptions || {});

    if (icon) icondf.effectiveLength = df.nrow();

    addMarkers(this, df, group, clusterOptions, clusterId, (df, i) => {
      let options = df.get(i);
      if (icon) options.icon = getIcon(i);
      return L.marker([df.get(i, "lat"), df.get(i, "lng")], options);
    });

  }
};

methods.addAwesomeMarkers = function(
  lat, lng, icon, layerId, group, options, popup, popupOptions,
  clusterOptions, clusterId, label, labelOptions, crosstalkOptions
) {
  let icondf;
  let getIcon;
  if (icon) {

    // This cbinds the icon URLs and any other icon options; they're all
    // present on the icon object.
    icondf = new DataFrame().cbind(icon);

    // Constructs an icon from a specified row of the icon dataframe.
    getIcon = function(i) {
      let opts = icondf.get(i);
      if (!opts) {
        return new L.AwesomeMarkers.icon();
      }

      if(opts.squareMarker) {
        opts.className = "awesome-marker awesome-marker-square";
      }
      return new L.AwesomeMarkers.icon(opts);
    };
  }

  if(!($.isEmptyObject(lat) || $.isEmptyObject(lng)) ||
      ($.isNumeric(lat) && $.isNumeric(lng))) {

    let df = new DataFrame()
      .col("lat", lat)
      .col("lng", lng)
      .col("layerId", layerId)
      .col("group", group)
      .col("popup", popup)
      .col("popupOptions", popupOptions)
      .col("label", label)
      .col("labelOptions", labelOptions)
      .cbind(options)
      .cbind(crosstalkOptions || {});

    if (icon) icondf.effectiveLength = df.nrow();

    addMarkers(this, df, group, clusterOptions, clusterId, function(df, i) {
      let options = df.get(i);
      if (icon) options.icon = getIcon(i);
      return L.marker([df.get(i, "lat"), df.get(i, "lng")], options);
    });
  }
};

function addLayers(map, category, df, layerFunc) {
  for (let i = 0; i < df.nrow(); i++) {
    (function() {
      let layer = layerFunc(df, i);
      if(!$.isEmptyObject(layer)) {
        let thisId = df.get(i, "layerId");
        let thisGroup = df.get(i, "group");
        this.layerManager.addLayer(layer, category, thisId, thisGroup, df.get(i, "ctGroup", true), df.get(i, "ctKey", true));
        if (layer.bindPopup) {
          let popup = df.get(i, "popup");
          let popupOptions = df.get(i, "popupOptions");
          if (popup !== null) {
            if (popupOptions !== null){
              layer.bindPopup(popup, popupOptions);
            } else {
              layer.bindPopup(popup);
            }
          }
        }
        if (layer.bindTooltip) {
          let label = df.get(i, "label");
          let labelOptions = df.get(i, "labelOptions");
          if (label !== null) {
            if (labelOptions !== null) {
              layer.bindTooltip(label, labelOptions);
            } else {
              layer.bindTooltip(label);
            }
          }
        }
        layer.on("click", mouseHandler(this.id, thisId, thisGroup, category + "_click"), this);
        layer.on("mouseover", mouseHandler(this.id, thisId, thisGroup, category + "_mouseover"), this);
        layer.on("mouseout", mouseHandler(this.id, thisId, thisGroup, category + "_mouseout"), this);
        let highlightStyle = df.get(i,"highlightOptions");

        if(!$.isEmptyObject(highlightStyle)) {

          let defaultStyle = {};
          $.each(highlightStyle, function (k, v) {
            if(k != "bringToFront" && k != "sendToBack"){
              if(df.get(i,k)) {
                defaultStyle[k] = df.get(i,k);
              }
            }
          });

          layer.on("mouseover",
            function(e) {
              this.setStyle(highlightStyle);
              if(highlightStyle.bringToFront) {
                this.bringToFront();
              }
            });
          layer.on("mouseout",
            function(e) {
              this.setStyle(defaultStyle);
              if(highlightStyle.sendToBack) {
                this.bringToBack();
              }
            });
        }
      }
    }).call(map);
  }
}

methods.addGenericLayers = addLayers;

methods.addCircles = function(lat, lng, radius, layerId, group, options, popup, popupOptions, label, labelOptions, highlightOptions, crosstalkOptions) {
  if(!($.isEmptyObject(lat) || $.isEmptyObject(lng)) ||
      ($.isNumeric(lat) && $.isNumeric(lng))) {
    let df = new DataFrame()
      .col("lat", lat)
      .col("lng", lng)
      .col("radius", radius)
      .col("layerId", layerId)
      .col("group", group)
      .col("popup", popup)
      .col("popupOptions", popupOptions)
      .col("label", label)
      .col("labelOptions", labelOptions)
      .col("highlightOptions", highlightOptions)
      .cbind(options)
      .cbind(crosstalkOptions || {});

    addLayers(this, "shape", df, function(df, i) {
      if($.isNumeric(df.get(i, "lat")) && $.isNumeric(df.get(i, "lng")) &&
            $.isNumeric(df.get(i,"radius"))) {
        return L.circle([df.get(i, "lat"), df.get(i, "lng")], df.get(i, "radius"), df.get(i));
      } else {
        return null;
      }
    });
  }
};

methods.addCircleMarkers = function(lat, lng, radius, layerId, group, options, clusterOptions, clusterId, popup, popupOptions, label, labelOptions, crosstalkOptions) {
  if(!($.isEmptyObject(lat) || $.isEmptyObject(lng)) ||
      ($.isNumeric(lat) && $.isNumeric(lng))) {
    let df = new DataFrame()
      .col("lat", lat)
      .col("lng", lng)
      .col("radius", radius)
      .col("layerId", layerId)
      .col("group", group)
      .col("popup", popup)
      .col("popupOptions", popupOptions)
      .col("label", label)
      .col("labelOptions", labelOptions)
      .cbind(crosstalkOptions || {})
      .cbind(options);

    addMarkers(this, df, group, clusterOptions, clusterId, function(df, i) {
      return L.circleMarker([df.get(i, "lat"), df.get(i, "lng")], df.get(i));
    });
  }
};

/*
 * @param lat Array of arrays of latitude coordinates for polylines
 * @param lng Array of arrays of longitude coordinates for polylines
 */
methods.addPolylines = function(polygons, layerId, group, options, popup, popupOptions, label, labelOptions, highlightOptions) {
  if(polygons.length>0) {
    let df = new DataFrame()
      .col("shapes", polygons)
      .col("layerId", layerId)
      .col("group", group)
      .col("popup", popup)
      .col("popupOptions", popupOptions)
      .col("label", label)
      .col("labelOptions", labelOptions)
      .col("highlightOptions", highlightOptions)
      .cbind(options);

    addLayers(this, "shape", df, function(df, i) {
      let shapes = df.get(i, "shapes");
      shapes = shapes.map(shape => HTMLWidgets.dataframeToD3(shape[0]));
      if(shapes.length > 1) {
        return L.polyline(shapes, df.get(i));
      } else {
        return L.polyline(shapes[0], df.get(i));
      }
    });
  }
};

methods.removeMarker = function(layerId) {
  this.layerManager.removeLayer("marker", layerId);
};

methods.clearMarkers = function() {
  this.layerManager.clearLayers("marker");
};

methods.removeMarkerCluster = function(layerId) {
  this.layerManager.removeLayer("cluster", layerId);
};

methods.removeMarkerFromCluster = function(layerId, clusterId) {
  let cluster = this.layerManager.getLayer("cluster", clusterId);
  if (!cluster) return;
  cluster.clusterLayerStore.remove(layerId);
};

methods.clearMarkerClusters = function() {
  this.layerManager.clearLayers("cluster");
};

methods.removeShape = function(layerId) {
  this.layerManager.removeLayer("shape", layerId);
};

methods.clearShapes = function() {
  this.layerManager.clearLayers("shape");
};

methods.addRectangles = function(lat1, lng1, lat2, lng2, layerId, group, options, popup, popupOptions, label, labelOptions, highlightOptions) {
  let df = new DataFrame()
    .col("lat1", lat1)
    .col("lng1", lng1)
    .col("lat2", lat2)
    .col("lng2", lng2)
    .col("layerId", layerId)
    .col("group", group)
    .col("popup", popup)
    .col("popupOptions", popupOptions)
    .col("label", label)
    .col("labelOptions", labelOptions)
    .col("highlightOptions", highlightOptions)
    .cbind(options);

  addLayers(this, "shape", df, function(df, i) {
    if($.isNumeric(df.get(i, "lat1")) && $.isNumeric(df.get(i, "lng1")) &&
    $.isNumeric(df.get(i, "lat2")) && $.isNumeric(df.get(i, "lng2"))) {
      return L.rectangle(
        [
          [df.get(i, "lat1"), df.get(i, "lng1")],
          [df.get(i, "lat2"), df.get(i, "lng2")]
        ],
        df.get(i));
    } else {
      return null;
    }
  });
};

/*
 * @param lat Array of arrays of latitude coordinates for polygons
 * @param lng Array of arrays of longitude coordinates for polygons
 */
methods.addPolygons = function(polygons, layerId, group, options, popup, popupOptions, label, labelOptions, highlightOptions) {
  if(polygons.length>0) {
    let df = new DataFrame()
      .col("shapes", polygons)
      .col("layerId", layerId)
      .col("group", group)
      .col("popup", popup)
      .col("popupOptions", popupOptions)
      .col("label", label)
      .col("labelOptions", labelOptions)
      .col("highlightOptions", highlightOptions)
      .cbind(options);

    addLayers(this, "shape", df, function(df, i) {
      // This code used to use L.multiPolygon, but that caused
      // double-click on a multipolygon to fail to zoom in on the
      // map. Surprisingly, putting all the rings in a single
      // polygon seems to still work; complicated multipolygons
      // are still rendered correctly.
      let shapes = df.get(i, "shapes")
        .map(polygon => polygon.map(HTMLWidgets.dataframeToD3))
        .reduce((acc, val) => acc.concat(val), []);
      return L.polygon(shapes, df.get(i));
    });
  }
};

methods.addGeoJSON = function(data, layerId, group, style) {
  // This time, self is actually needed because the callbacks below need
  // to access both the inner and outer senses of "this"
  let self = this;
  if (typeof(data) === "string") {
    data = JSON.parse(data);
  }

  let globalStyle = $.extend({}, style, data.style || {});

  let gjlayer = L.geoJson(data, {
    style: function(feature) {
      if (feature.style || feature.properties.style) {
        return $.extend({}, globalStyle, feature.style, feature.properties.style);
      } else {
        return globalStyle;
      }
    },
    onEachFeature: function(feature, layer) {
      let extraInfo = {
        featureId: feature.id,
        properties: feature.properties
      };
      let popup = feature.properties ? feature.properties.popup : null;
      if (typeof popup !== "undefined" && popup !== null) layer.bindPopup(popup);
      layer.on("click", mouseHandler(self.id, layerId, group, "geojson_click", extraInfo), this);
      layer.on("mouseover", mouseHandler(self.id, layerId, group, "geojson_mouseover", extraInfo), this);
      layer.on("mouseout", mouseHandler(self.id, layerId, group, "geojson_mouseout", extraInfo), this);
    }
  });
  this.layerManager.addLayer(gjlayer, "geojson", layerId, group);
};

methods.removeGeoJSON = function(layerId) {
  this.layerManager.removeLayer("geojson", layerId);
};

methods.clearGeoJSON = function() {
  this.layerManager.clearLayers("geojson");
};

methods.addTopoJSON = function(data, layerId, group, style) {
  // This time, self is actually needed because the callbacks below need
  // to access both the inner and outer senses of "this"
  let self = this;
  if (typeof(data) === "string") {
    data = JSON.parse(data);
  }

  let globalStyle = $.extend({}, style, data.style || {});

  let gjlayer = L.geoJson(null, {
    style: function(feature) {
      if (feature.style || feature.properties.style) {
        return $.extend({}, globalStyle, feature.style, feature.properties.style);
      } else {
        return globalStyle;
      }
    },
    onEachFeature: function(feature, layer) {
      let extraInfo = {
        featureId: feature.id,
        properties: feature.properties
      };
      let popup = feature.properties.popup;
      if (typeof popup !== "undefined" && popup !== null) layer.bindPopup(popup);
      layer.on("click", mouseHandler(self.id, layerId, group, "topojson_click", extraInfo), this);
      layer.on("mouseover", mouseHandler(self.id, layerId, group, "topojson_mouseover", extraInfo), this);
      layer.on("mouseout", mouseHandler(self.id, layerId, group, "topojson_mouseout", extraInfo), this);
    }
  });
  global.omnivore.topojson.parse(data, null, gjlayer);
  this.layerManager.addLayer(gjlayer, "topojson", layerId, group);
};

methods.removeTopoJSON = function(layerId) {
  this.layerManager.removeLayer("topojson", layerId);
};

methods.clearTopoJSON = function() {
  this.layerManager.clearLayers("topojson");
};

methods.addControl = function(html, position, layerId, classes) {
  function onAdd(map) {
    let div = L.DomUtil.create("div", classes);
    if (typeof layerId !== "undefined" && layerId !== null) {
      div.setAttribute("id", layerId);
    }
    this._div = div;

    // It's possible for window.Shiny to be true but Shiny.initializeInputs to
    // not be, when a static leaflet widget is included as part of the shiny
    // UI directly (not through leafletOutput or uiOutput). In this case we
    // don't do the normal Shiny stuff as that will all happen when Shiny
    // itself loads and binds the entire doc.

    if (window.Shiny && Shiny.initializeInputs) {
      Shiny.renderHtml(html, this._div);
      Shiny.initializeInputs(this._div);
      Shiny.bindAll(this._div);
    } else {
      this._div.innerHTML = html;
    }

    return this._div;
  }
  function onRemove(map) {
    if (window.Shiny && Shiny.unbindAll) {
      Shiny.unbindAll(this._div);
    }
  }
  let Control = L.Control.extend({
    options: {position: position},
    onAdd: onAdd,
    onRemove: onRemove
  });
  this.controls.add(new Control, layerId, html);
};

methods.addCustomControl = function(control, layerId) {
  this.controls.add(control, layerId);
};

methods.removeControl = function(layerId) {
  this.controls.remove(layerId);
};

methods.getControl = function(layerId) {
  this.controls.get(layerId);
};

methods.clearControls = function() {
  this.controls.clear();
};

methods.addLegend = function(options) {
  let legend = L.control({position: options.position});
  let gradSpan;

  legend.onAdd = function (map) {
    let div = L.DomUtil.create("div", options.className),
      colors = options.colors,
      labels = options.labels,
      legendHTML = "";
    if (options.type === "numeric") {
      // # Formatting constants.
      let singleBinHeight = 20;  // The distance between tick marks, in px
      let vMargin = 8; // If 1st tick mark starts at top of gradient, how
      // many extra px are needed for the top half of the
      // 1st label? (ditto for last tick mark/label)
      let tickWidth = 4;     // How wide should tick marks be, in px?
      let labelPadding = 6;  // How much distance to reserve for tick mark?
      // (Must be >= tickWidth)

      // # Derived formatting parameters.

      // What's the height of a single bin, in percentage (of gradient height)?
      // It might not just be 1/(n-1), if the gradient extends past the tick
      // marks (which can be the case for pretty cut points).
      let singleBinPct = (options.extra.p_n - options.extra.p_1) / (labels.length - 1);
      // Each bin is `singleBinHeight` high. How tall is the gradient?
      let totalHeight = (1 / singleBinPct) * singleBinHeight + 1;
      // How far should the first tick be shifted down, relative to the top
      // of the gradient?
      let tickOffset = (singleBinHeight / singleBinPct) * options.extra.p_1;

      gradSpan = $("<span/>").css({
        "background": "linear-gradient(" + colors + ")",
        "opacity": options.opacity,
        "height": totalHeight + "px",
        "width": "18px",
        "display": "block",
        "margin-top": vMargin + "px"
      });
      let leftDiv = $("<div/>").css("float", "left"),
        rightDiv = $("<div/>").css("float", "left");
      leftDiv.append(gradSpan);
      $(div).append(leftDiv).append(rightDiv)
        .append($("<br>"));

      // Have to attach the div to the body at this early point, so that the
      // svg text getComputedTextLength() actually works, below.
      document.body.appendChild(div);

      let ns = "http://www.w3.org/2000/svg";
      let svg = document.createElementNS(ns, "svg");
      rightDiv.append(svg);
      let g = document.createElementNS(ns, "g");
      $(g).attr("transform", "translate(0, " + vMargin + ")");
      svg.appendChild(g);

      // max label width needed to set width of svg, and right-justify text
      let maxLblWidth = 0;

      // Create tick marks and labels
      $.each(labels, function(i, label) {
        let y = tickOffset + i*singleBinHeight + 0.5;

        let thisLabel = document.createElementNS(ns, "text");
        $(thisLabel)
          .text(labels[i])
          .attr("y", y)
          .attr("dx", labelPadding)
          .attr("dy", "0.5ex");
        g.appendChild(thisLabel);
        maxLblWidth = Math.max(maxLblWidth, thisLabel.getComputedTextLength());

        let thisTick = document.createElementNS(ns, "line");
        $(thisTick)
          .attr("x1", 0)
          .attr("x2", tickWidth)
          .attr("y1", y)
          .attr("y2", y)
          .attr("stroke-width", 1);
        g.appendChild(thisTick);
      });

      // Now that we know the max label width, we can right-justify
      $(svg).find("text")
        .attr("dx", labelPadding + maxLblWidth)
        .attr("text-anchor", "end");
      // Final size for <svg>
      $(svg).css({
        width: (maxLblWidth + labelPadding) + "px",
        height: totalHeight + vMargin*2 + "px"
      });

      if (options.na_color && ($.inArray(options.na_label, labels)<0) ) {
        $(div).append("<div><i style=\"" +
                      "background:" + options.na_color +
                      ";opacity:" + options.opacity +
                      ";margin-right:" + labelPadding + "px" +
                      ";\"></i>" + options.na_label + "</div>");
      }
    } else {
      if (options.na_color && ($.inArray(options.na_label, labels)<0) ) {
        colors.push(options.na_color);
        labels.push(options.na_label);
      }
      for (let i = 0; i < colors.length; i++) {
        legendHTML += "<i style=\"background:" + colors[i] + ";opacity:" +
                      options.opacity + "\"></i> " + labels[i] + "<br>";
      }
      div.innerHTML = legendHTML;
    }
    if (options.title)
      $(div).prepend("<div style=\"margin-bottom:3px\"><strong>" +
                      options.title + "</strong></div>");
    return div;
  };

  if(options.group) {
    // Auto generate a layerID if not provided
    if(!options.layerId) {
      options.layerId = L.Util.stamp(legend);
    }

    let map = this;
    map.on("overlayadd", function(e){
      if(e.name === options.group) {
        map.controls.add(legend, options.layerId);
      }
    });
    map.on("overlayremove", function(e){
      if(e.name === options.group) {
        map.controls.remove(options.layerId);
      }
    });
    map.on("groupadd", function(e){
      if(e.name === options.group) {
        map.controls.add(legend, options.layerId);
      }
    });
    map.on("groupremove", function(e){
      if(e.name === options.group) {
        map.controls.remove(options.layerId);
      }
    });
  }

  this.controls.add(legend, options.layerId);
};

methods.addLayersControl = function(baseGroups, overlayGroups, options) {

  // Only allow one layers control at a time
  methods.removeLayersControl.call(this);

  let firstLayer = true;
  let base = {};
  $.each(asArray(baseGroups), (i, g) => {
    let layer = this.layerManager.getLayerGroup(g, true);
    if (layer) {
      base[g] = layer;

      // Check if >1 base layers are visible; if so, hide all but the first one
      if (this.hasLayer(layer)) {
        if (firstLayer) {
          firstLayer = false;
        } else {
          this.removeLayer(layer);
        }
      }
    }
  });
  let overlay = {};
  $.each(asArray(overlayGroups), (i, g) => {
    let layer = this.layerManager.getLayerGroup(g, true);
    if (layer) {
      overlay[g] = layer;
    }
  });

  this.currentLayersControl = L.control.layers(base, overlay, options);
  this.addControl(this.currentLayersControl);
};

methods.removeLayersControl = function() {
  if (this.currentLayersControl) {
    this.removeControl(this.currentLayersControl);
    this.currentLayersControl = null;
  }
};

methods.addScaleBar = function(options) {

  // Only allow one scale bar at a time
  methods.removeScaleBar.call(this);

  let scaleBar = L.control.scale(options).addTo(this);
  this.currentScaleBar = scaleBar;
};

methods.removeScaleBar = function() {
  if (this.currentScaleBar) {
    this.currentScaleBar.remove();
    this.currentScaleBar = null;
  }
};

methods.hideGroup = function(group) {
  $.each(asArray(group), (i, g) => {
    let layer = this.layerManager.getLayerGroup(g, true);
    if (layer) {
      this.removeLayer(layer);
    }
  });
};

methods.showGroup = function(group) {
  $.each(asArray(group), (i, g) => {
    let layer = this.layerManager.getLayerGroup(g, true);
    if (layer) {
      this.addLayer(layer);
    }
  });
};

function setupShowHideGroupsOnZoom(map) {
  if (map.leafletr._hasInitializedShowHideGroups) {
    return;
  }
  map.leafletr._hasInitializedShowHideGroups = true;

  function setVisibility(layer, visible, group) {
    if (visible !== map.hasLayer(layer)) {
      if (visible) {
        map.addLayer(layer);
        map.fire("groupadd", {"name": group, "layer": layer});
      } else {
        map.removeLayer(layer);
        map.fire("groupremove", {"name": group, "layer": layer});
      }
    }
  }

  function showHideGroupsOnZoom() {
    if (!map.layerManager)
      return;

    let zoom = map.getZoom();
    map.layerManager.getAllGroupNames().forEach(group => {
      let layer = map.layerManager.getLayerGroup(group, false);
      if (layer && typeof(layer.zoomLevels) !== "undefined") {
        setVisibility(layer,
          layer.zoomLevels === true || layer.zoomLevels.indexOf(zoom) >= 0,
          group);
      }
    });
  }

  map.showHideGroupsOnZoom = showHideGroupsOnZoom;
  map.on("zoomend", showHideGroupsOnZoom);
}

methods.setGroupOptions = function(group, options) {
  $.each(asArray(group), (i, g) => {
    let layer = this.layerManager.getLayerGroup(g, true);
    // This slightly tortured check is because 0 is a valid value for zoomLevels
    if (typeof(options.zoomLevels) !== "undefined" && options.zoomLevels !== null) {
      layer.zoomLevels = asArray(options.zoomLevels);
    }
  });

  setupShowHideGroupsOnZoom(this);
  this.showHideGroupsOnZoom();
};

methods.removeImage = function(layerId) {
  this.layerManager.removeLayer("image", layerId);
};

methods.clearImages = function() {
  this.layerManager.clearLayers("image");
};

methods.addMeasure = function(options){
  // if a measureControl already exists, then remove it and
  //   replace with a new one
  methods.removeMeasure.call(this);
  this.measureControl = L.control.measure(options);
  this.addControl(this.measureControl);
};

methods.removeMeasure = function() {
  if(this.measureControl) {
    this.removeControl(this.measureControl);
    this.measureControl = null;
  }
};

methods.addSelect = function(ctGroup) {
  methods.removeSelect.call(this);

  this._selectButton = L.easyButton({
    states: [
      {
        stateName: "select-inactive",
        icon: "ion-qr-scanner",
        title: "Make a selection",
        onClick: (btn, map) => {
          btn.state("select-active");
          this._locationFilter = new L.LocationFilter2();

          if (ctGroup) {
            let selectionHandle = new global.crosstalk.SelectionHandle(ctGroup);
            selectionHandle.on("change", (e) => {
              if (e.sender !== selectionHandle) {
                if (this._locationFilter) {
                  this._locationFilter.disable();
                  btn.state("select-inactive");
                }
              }
            });
            let handler = (e) => {
              this.layerManager.brush(this._locationFilter.getBounds(),
                {sender: selectionHandle}
              );
            };
            this._locationFilter.on("enabled", handler);
            this._locationFilter.on("change", handler);
            this._locationFilter.on("disabled", () => {
              selectionHandle.close();
              this._locationFilter = null;
            });
          }

          this._locationFilter.addTo(map);
        }
      },
      {
        stateName: "select-active",
        icon: "ion-close-round",
        title: "Dismiss selection",
        onClick: (btn, map) => {
          btn.state("select-inactive");
          this._locationFilter.disable();
          // If explicitly dismissed, clear the crosstalk selections
          this.layerManager.unbrush();
        }
      }
    ]
  });

  this._selectButton.addTo(this);
};

methods.removeSelect = function() {
  if (this._locationFilter) {
    this._locationFilter.disable();
  }

  if (this._selectButton) {
    this.removeControl(this._selectButton);
    this._selectButton = null;
  }
};



methods.createMapPane = function (name, zIndex) {
  this.createPane(name);
  this.getPane(name).style.zIndex = zIndex;
};
