### geojson-vt &mdash; GeoJSON Vector Tiles

A highly efficient JavaScript library for **slicing GeoJSON data into vector tiles on the fly**,
primarily designed to enable rendering and interacting with large geospatial datasets
on the browser side (without a server).

Created to power GeoJSON in [Mapbox GL JS](https://github.com/mapbox/mapbox-gl-js),
but can be useful in other visualization platforms
like [Leaflet](https://github.com/Leaflet/Leaflet) and [d3](https://github.com/mbostock/d3).

Resulting tiles conform to the JSON equivalent
of the [vector tile specification](https://github.com/mapbox/vector-tile-spec/).
To make data rendering and interaction fast, the tiles are simplified,
retaining the minimum level of detail appropriate for each zoom level
(simplifying shapes, filtering out tiny polygons and polylines).

#### Usage

```js
// build an initial index of tiles
var tileIndex = geojsonvt(geoJSON, { // all parameters are optional, with sensible defaults
	baseZoom: 14, // max zoom to preserve detail on
	maxZoom: 4, // zoom to slice down on first pass
	maxPoints: 100, // during first pass, stop slicing each tile below this number of points
	debug: 0 // debug level: 1 = some timing info; 2 = individual tiles timing;
});

// request a particular tile
var features = tileIndex.getTile(z, x, y).features;
```

#### Demo

Here's **geojson-vt** action in [Mapbox GL JS](https://github.com/mapbox/mapbox-gl-js),
dynamically loading a 100Mb US zip codes GeoJSON with 5.4 million points:

![](https://cloud.githubusercontent.com/assets/25395/5360312/86028d8e-7f91-11e4-811f-87f24acb09ca.gif)

There's a convenient page to test out **geojson-vt** on different data. Run `npm install` to install dependencies,
then `npm run build-dev`. Now open `debug/index.html` in your browser and drag any GeoJSON on the page, watching the console.

![](https://cloud.githubusercontent.com/assets/25395/5363235/41955c6e-7fa8-11e4-9575-a66ef54cb6d9.gif)
