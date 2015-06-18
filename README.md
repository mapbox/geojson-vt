## geojson-vt &mdash; GeoJSON Vector Tiles

[![Build Status](https://travis-ci.org/mapbox/geojson-vt.svg)](https://travis-ci.org/mapbox/geojson-vt)
[![Coverage Status](https://coveralls.io/repos/mapbox/geojson-vt/badge.svg)](https://coveralls.io/r/mapbox/geojson-vt)

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

### Demo

Here's **geojson-vt** action in [Mapbox GL JS](https://github.com/mapbox/mapbox-gl-js),
dynamically loading a 100Mb US zip codes GeoJSON with 5.4 million points:

![](https://cloud.githubusercontent.com/assets/25395/5360312/86028d8e-7f91-11e4-811f-87f24acb09ca.gif)

There's a convenient debug page to test out **geojson-vt** on different data.
Make sure you have the [dev version built](#browser-builds);
open `debug/index.html` in your browser,
and drag any GeoJSON on the page, watching the console.

![](https://cloud.githubusercontent.com/assets/25395/5363235/41955c6e-7fa8-11e4-9575-a66ef54cb6d9.gif)

### Usage

```js
// build an initial index of tiles
var tileIndex = geojsonvt(geoJSON);

// request a particular tile
var features = tileIndex.getTile(z, x, y).features;
```

### Options

You can fine-tune the results with an options object,
although the defaults are sensible and work well for most use cases.

```js
var tileIndes = geojsonvt(data, {
	maxZoom: 14,  // max zoom to preserve detail on
	tolerance: 3, // simplification tolerance (higher means simpler)
	extent: 4096, // tile extent (both width and height)
	buffer: 64,	  // tile buffer on each side
	debug: 0      // logging level (0 to disable, 1 or 2)

	indexMaxZoom: 4,        // max zoom in the initial tile index
	indexMaxPoints: 100000, // max number of points per tile in the index
});
```

### Browser builds

```bash
npm install
npm run build-dev # development build, used by the debug page
npm run build-min # minified production build
```

### Changelog

##### 2.1.1 (June 18, 2015)

- Fixed duplicate points in polygons.

##### 2.1.0 (June 15, 2015)

- Added proper handling for features crossing or near the date line.

##### 2.0.1 (June 9, 2015)

- 10-20% faster tile indexing.
- Fixed latitude extremes not being clamped.

##### 2.0.0 (Mar 20, 2015)

- **Breaking**: `maxZoom` renamed to `indexMaxZoom`, `maxPoints` to `indexMaxPoints`, `baseZoom` to `maxZoom`.
- Improved performance of both indexing and on-demand tile requests.
- Improved memory footprint.
- Better indexing defaults.
- Fixed a bug where unnecessary memory was retained in some cases.

##### 1.1.0 (Mar 2, 2015)

- Add `buffer` and `extent` options.

##### 1.0.0 (Dec 8, 2014)

- Initial release.
