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

void extent;
