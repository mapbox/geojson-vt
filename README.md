### geojson-vt &mdash; GeoJSON Vector Tiles

A highly efficient JavaScript library for **slicing GeoJSON data into vector tiles on the fly**,
primarily designed to enable rendering and interacting with large geospatial datasets
on the browser side (without a server).

Created to power GeoJSON in [Mapbox GL JS](https://github.com/mapbox/mapbox-gl-js),
but can be useful in other visualization platforms
like [Leaflet](https://github.com/Leaflet/Leaflet) and [d3](https://github.com/mbostock/d3).
It can also be easily used on the server as well.

Resulting tiles conform to the JSON equivalent
of the [vector tile specification](https://github.com/mapbox/vector-tile-spec/).
To make data rendering and interaction fast, the tiles are simplified,
retaining the minimum level of detail appropriate for each zoom level
(simplifying shapes, filtering out tiny polygons and polylines).

#### Demo

Here's **geojson-vt** action in [Mapbox GL JS](https://github.com/mapbox/mapbox-gl-js),
dynamically loading a 100Mb US zip codes GeoJSON with 5.4 million points:

![](https://cloud.githubusercontent.com/assets/25395/5360312/86028d8e-7f91-11e4-811f-87f24acb09ca.gif)

There's a convenient debug page to test out **geojson-vt** on different data.
Make sure you have the [dev version built](#browser-builds);
open `debug/index.html` in your browser,
and drag any GeoJSON on the page, watching the console.

![](https://cloud.githubusercontent.com/assets/25395/5363235/41955c6e-7fa8-11e4-9575-a66ef54cb6d9.gif)

#### Usage

```js
// build an initial index of tiles
var tileIndex = geojsonvt(geoJSON);

// request a particular tile
var features = tileIndex.getTile(z, x, y).features;
```

#### Options

You can fine-tune the results with an options object,
although the defaults are sensible and work well for most use cases.

```js
var tileIndes = geojsonvt(data, {
	baseZoom: 14,   // max zoom to preserve detail on
	maxZoom: 4,     // zoom to slice down to on first pass
	maxPoints: 100, // stop slicing each tile below this number of points
	tolerance: 3,   // simplification tolerance (higher means simpler)
	extent: 4096,   // tile extent (both width and height)
	buffer: 64,		// tile buffer on each side
	debug: 0        // logging level (0 to disable, 1 or 2)
});
```

#### Browser builds

```bash
npm install
npm run build-dev # development build, used by the debug page
npm run build-min # minified production build
```
