
import clip from './clip.js';
import createFeature, {POINT} from './feature.js';

export default function wrap(features, options) {
    const buffer = options.buffer / options.extent;
    let merged = features;
    const left  = clip(features, 1, -1 - buffer, buffer,     0, -1, 2, options); // left world copy
    const right = clip(features, 1,  1 - buffer, 2 + buffer, 0, -1, 2, options); // right world copy

    if (left || right) {
        merged = clip(features, 1, -buffer, 1 + buffer, 0, -1, 2, options) || []; // center world copy

        if (left)  merged = shiftFeatureCoords(left,  1).concat(merged); // merge left into center
        if (right) merged = merged.concat(shiftFeatureCoords(right, -1)); // merge right into center
    }
    return merged;
}

function shiftFeatureCoords(features, offset) {
    const out = [];
    for (const feature of features) {
        const newGeom = shiftGeom(feature.geometry, feature.type, offset);
        const shifted = createFeature(feature.id, feature.type, newGeom, feature.tags);
        if (feature.start !== undefined) {
            shifted.start = feature.start;
            shifted.end = feature.end;
        }
        out.push(shifted);
    }
    return out;
}

// Build a shifted copy of a feature's geometry — a single new buffer per
// feature (POINT: flat coords; LINE/POLYGON: inline-header rings).
function shiftGeom(geom, type, offset) {
    const out = [];
    if (type === POINT) {
        for (let i = 0; i < geom.length; i += 3) {
            out.push(geom[i] + offset, geom[i + 1], geom[i + 2]);
        }
    } else {
        for (let i = 0; i < geom.length;) {
            const ringLen = geom[i];
            const ringSize = geom[i + 1];
            out.push(ringLen, ringSize);
            const coordsEnd = i + 2 + ringLen * 3;
            for (let j = i + 2; j < coordsEnd; j += 3) {
                out.push(geom[j] + offset, geom[j + 1], geom[j + 2]);
            }
            i = coordsEnd;
        }
    }
    return out;
}
