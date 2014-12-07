### GeoJSON Vector Tiles

A highly efficient JavaScript library for slicing GeoJSON data
into [vector tiles](https://github.com/mapbox/vector-tile-spec/)
(or rather their JSON equivalent) on the fly,
primarily for rendering purposes.

Created to power GeoJSON rendering in [Mapbox GL JS](https://github.com/mapbox/mapbox-gl-js),
but can be useful for other data visualization purposes.

#### Usage

```js
// build an initial index of tiles
var tileIndex = geojsonvt(geoJSON, {
	baseZoom: 14, // max zoom to preserve detail on
	maxZoom: 14, // zoom to slice down on first pass
	maxPoints: 100, // during first pass, stop slicing each tile below this number of points
	debug: 0 // debug level: 1 = some timing info; 2 = individual tiles timing;
});

// request a particular tile
var features = tileIndex.getTile(z, x, y).features;
```

#### Demo

To see a **geojson-vt** in action, run `npm run build-dev`,
then open `debug/index.html` in your browser and drag any GeoJSON on the page.
It was tested on files up to 100Mb:

![](https://cloud.githubusercontent.com/assets/25395/5328953/4edebdac-7d64-11e4-8e99-dddfd00851fb.gif)
