## geojson-vt &mdash; GeoJSON Vector Tiles [![Node](https://github.com/mapbox/geojson-vt/actions/workflows/node.yml/badge.svg)](https://github.com/mapbox/geojson-vt/actions/workflows/node.yml) [![](https://img.shields.io/badge/simply-awesome-brightgreen.svg)](https://github.com/mourner/projects)

A highly efficient JavaScript library for **slicing GeoJSON data into vector tiles on the fly**,
primarily designed to enable rendering and interacting with large geospatial datasets
on the browser side (without a server).

Created to power GeoJSON in [Mapbox GL JS](https://github.com/mapbox/mapbox-gl-js),
but can be useful in other visualization platforms
like [Leaflet](https://github.com/Leaflet/Leaflet), [OpenLayers](https://openlayers.org/) and [d3](https://github.com/mbostock/d3),
as well as Node.js server applications.

Resulting tiles conform to the JSON equivalent
of the [vector tile specification](https://github.com/mapbox/vector-tile-spec/).
To make data rendering and interaction fast, the tiles are simplified,
retaining the minimum level of detail appropriate for each zoom level
(simplifying shapes, filtering out tiny polygons and polylines).

Read more on how the library works [on the Mapbox blog](https://blog.mapbox.com/rendering-big-geodata-on-the-fly-with-geojson-vt-4e4d2a5dd1f2).

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
const tileIndex = new GeoJSONVT(geoJSON);

// request a particular tile
const features = tileIndex.getTile(z, x, y).features;

// show an array of tile coordinates created so far
console.log(tileIndex.tileCoords); // [{z: 0, x: 0, y: 0}, ...]
```

`getTile` returns `null` outside the data, and builds a fresh `[x, y]`-pair structure on every call.
For a zero-copy alternative, `getTileRaw` hands back the tile as stored &mdash; flat
`[x, y, x, y, ...]` typed arrays, one per ring, with no per-coordinate objects:

```js
const {features} = tileIndex.getTileRaw(z, x, y);

for (const {type, geometry} of features) {
	// type 4 is a lone point, with `x`/`y` inline instead of a `geometry`;
	// 1 is a multi-point (one flat array), 2 and 3 are lines and polygons (an array of rings)
}
```

The arrays belong to the index, so treat them as read-only and don't hold them past its lifetime.

### Options

You can fine-tune the results with an options object,
although the defaults are sensible and work well for most use cases.

```js
const tileIndex = new GeoJSONVT(data, {
	maxZoom: 14,  // max zoom to preserve detail on; can't be higher than 24
	tolerance: 3, // simplification tolerance (higher means simpler)
	extent: 4096, // tile extent (both width and height)
	buffer: 64,   // tile buffer on each side
	debug: 0,     // logging level (0 to disable, 1 or 2)
	lineMetrics: false, // whether to enable line metrics tracking for LineString/MultiLineString features
	promoteId: null,    // name of a feature property to promote to feature.id. Cannot be used with `generateId`
	generateId: false,  // whether to generate feature ids. Cannot be used with `promoteId`
	indexMaxZoom: 5,       // max zoom in the initial tile index
	indexMaxPoints: 100000 // max number of points per tile in the index
});
```

By default, tiles at zoom levels above `indexMaxZoom` are generated on the fly, but you can pre-generate all possible tiles for `data` by setting `indexMaxZoom` and `maxZoom` to the same value, setting `indexMaxPoints` to `0`, and then accessing the resulting tile coordinates from the `tileCoords` property of `tileIndex`.

The `promoteId` and `generateId` options ignore existing `id` values on the feature objects.

GeoJSON-VT only operates on zoom levels up to 24.

### Install

Install using NPM (`npm install geojson-vt`), then:

```js
// import as a ES module
import GeoJSONVT from 'geojson-vt';

// import from a CDN in the browser:
import GeoJSONVT from 'https://esm.run/geojson-vt';
```

Or use a browser build directly:

```html
<script src="https://unpkg.com/geojson-vt/geojson-vt.js"></script>
<script>
    const tileIndex = new GeoJSONVT(geoJSON); // exposed as a `GeoJSONVT` global
</script>
```

### TypeScript

Type declarations ship with the library; remove `@types/geojson-vt` if you have it.

```ts
import GeoJSONVT, {type Options, type LegacyFeature} from 'geojson-vt';

const options: Options = {maxZoom: 12};
const tile = new GeoJSONVT(geoJSON, options).getTile(0, 0, 0); // null outside the data
const features: LegacyFeature[] = tile ? tile.features : [];
```
