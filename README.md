## geojson-vt &mdash; GeoJSON Vector Tiles

[![Build Status](https://travis-ci.org/mapbox/geojson-vt.svg?branch=master)](https://travis-ci.org/mapbox/geojson-vt)
[![Coverage Status](https://coveralls.io/repos/mapbox/geojson-vt/badge.svg)](https://coveralls.io/r/mapbox/geojson-vt)

A highly efficient JavaScript library for **slicing GeoJSON data into vector tiles on the fly**,
primarily designed to enable rendering and interacting with large geospatial datasets
on the browser side (without a server).

Created to power GeoJSON in [Mapbox GL JS](https://github.com/mapbox/mapbox-gl-js),
but can be useful in other visualization platforms
like [Leaflet](https://github.com/Leaflet/Leaflet) and [d3](https://github.com/mbostock/d3),
as well as Node.js server applications.

Resulting tiles conform to the JSON equivalent
of the [vector tile specification](https://github.com/mapbox/vector-tile-spec/).
To make data rendering and interaction fast, the tiles are simplified,
retaining the minimum level of detail appropriate for each zoom level
(simplifying shapes, filtering out tiny polygons and polylines).

Read more on how the library works [on the Mapbox blog](https://www.mapbox.com/blog/introducing-geojson-vt/).

There's a C++11 port: [geojson-vt-cpp](https://github.com/mapbox/geojson-vt-cpp)

### Demo

Here's **geojson-vt** action in [Mapbox GL JS](https://github.com/mapbox/mapbox-gl-js),
dynamically loading a 100Mb US zip codes GeoJSON with 5.4 million points:

![](https://cloud.githubusercontent.com/assets/25395/5360312/86028d8e-7f91-11e4-811f-87f24acb09ca.gif)

There's a convenient [debug page](http://mapbox.github.io/geojson-vt/debug/) to test out **geojson-vt** on different data.
Just drag any GeoJSON on the page, watching the console.

![](https://cloud.githubusercontent.com/assets/25395/5363235/41955c6e-7fa8-11e4-9575-a66ef54cb6d9.gif)

### Usage

```js
// build an initial index of tiles
var tileIndex = geojsonvt(geoJSON);

// request a particular tile
var features = tileIndex.getTile(z, x, y).features;

// show an array of tile coordinates created so far
console.log(tileIndex.tileCoords); // [{z: 0, x: 0, y: 0}, ...]
```

### Options

You can fine-tune the results with an options object,
although the defaults are sensible and work well for most use cases.

```js
var tileIndex = geojsonvt(data, {
	maxZoom: 14,  // max zoom to preserve detail on
	tolerance: 3, // simplification tolerance (higher means simpler)
	extent: 4096, // tile extent (both width and height)
	buffer: 64,	  // tile buffer on each side
	debug: 0      // logging level (0 to disable, 1 or 2)

	indexMaxZoom: 4,        // max zoom in the initial tile index
	indexMaxPoints: 100000, // max number of points per tile in the index
	solidChildren: false    // whether to include solid tile children in the index
});
```

### Browser builds

```bash
npm install
npm run build-dev # development build, used by the debug page
npm run build-min # minified production build
```

### Changelog

##### 2.1.8 (Nov 9, 2015)

- Fixed a bug where `getTile` would initially return `null` when requesting a child of a solid clipped square tile.

##### 2.1.7 (Oct 16, 2015)

- Expose transform methods in a separate file (`transform.js`).

##### 2.1.6 (Sep 22, 2015)

- Fixed a bug where `getTile` could generate a lot of unnecessary tiles.
- Fixed a bug where an empty GeoJSON generated tiles.

##### 2.1.5 (Aug 14, 2015)

- Added `tileCoords` property with an array of coordinates of all tiles created so far.

##### 2.1.4 (Aug 14, 2015)

- Improved `getTile` to always return `null` on non-existing or invalid tiles.

##### 2.1.3 (Aug 13, 2015)

- Added `solidChildren` option that includes children of solid filled square tiles in the index (off by default).
- Added back solid tile heuristics (not tiling solid filled square tiles further).

##### 2.1.2 (Aug 13, 2015)

- Fixed a crazy slowdown (~30x) when generating a huge number of tiles on the first run.
- Removed clipped solid square heuristics (that actually didn't work since 2.0.0).

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
