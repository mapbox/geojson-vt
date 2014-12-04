### GeoJSON Vector Tiles

A highly efficient JavaScript library for slicing GeoJSON data
into [vector tiles](https://github.com/mapbox/vector-tile-spec/)
(or rather their JSON equivalent) on the fly,
primarily for rendering purposes.

Created to power GeoJSON rendering in [Mapbox GL JS](https://github.com/mapbox/mapbox-gl-js),
but can be useful for other data visualization purposes.

#### Usage

```js
var tileIndex = geojsonvt(geoJSON);
```
