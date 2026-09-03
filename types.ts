// Compile-only check of the public types — `tsc --noEmit` in `pretest` is the assertion, nothing here
// runs. Lives at the root because `node --test` collects every `.ts` under `test/` and would report this
// as a test; a root name without a `-test`/`.test` suffix is left alone.

import GeoJSONVT from './src/index.js';
import type {Options} from './src/index.d.ts';

// Options is the constructor's input shape, so every field must stay optional: `{}` fails to compile the
// moment one becomes required. A partial literal is what `@types/geojson-vt` consumers already write.
const none: Options = {};
const some: Options = {maxZoom: 14, lineMetrics: true};

const index = new GeoJSONVT({type: 'Point', coordinates: [0, 0]}, some);
new GeoJSONVT({type: 'Point', coordinates: [0, 0]}, none);
new GeoJSONVT({type: 'Point', coordinates: [0, 0]});

// Resolved options, by contrast, have every field filled in.
const extent: number = index.options.extent;

// getTile is nullable, and a committed point feature's geometry is flat where the others nest.
const tile = index.getTile(0, 0, 0);
if (tile) for (const f of tile.features) {
    const first: [number, number] | [number, number][] = f.geometry[0];
    void first;
}

// getTileRaw is the zero-copy flavor: a lone point carries x/y, a multi-point one flat array, lines and
// polygons an array of rings.
const rawTile = index.getTileRaw(0, 0, 0);
if (rawTile) for (const f of rawTile.features) {
    if (f.type === 4) { const xy: [number, number] = [f.x, f.y]; void xy; }
    else if (f.type === 1) { const first: number = f.geometry[0]; void first; }
    else { const ring: Int16Array | Int32Array = f.geometry[0]; void ring; }
}

void extent;
