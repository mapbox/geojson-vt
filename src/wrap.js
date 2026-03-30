
import clip from './clip.js';
import createFeature, {optimizeLineMemory} from './feature.js';

export default function wrap(features, options) {
    const buffer = options.buffer / options.extent;
    let merged = features;
    const left  = clip(features, 1, -1 - buffer, buffer,     0, -1, 2, options); // left world copy
    const right = clip(features, 1,  1 - buffer, 2 + buffer, 0, -1, 2, options); // right world copy

    if (left || right) {
        merged = clip(features, 1, -buffer, 1 + buffer, 0, -1, 2, options) || []; // center world copy

        if (left) merged = shiftFeatureCoords(left, 1).concat(merged); // merge left into center
        if (right) merged = merged.concat(shiftFeatureCoords(right, -1)); // merge right into center
    }

    return merged;
}

function shiftFeatureCoords(features, offset) {
    const newFeatures = [];

    for (const feature of features) {
        const type = feature.type;

        let newGeometry;

        if (type === 'Point' || type === 'MultiPoint') {
            newGeometry = shiftPointCoords(feature.geometry, offset);

        } else if (type === 'LineString') {
            newGeometry = shiftLineCoords(feature.geometry, offset);

        } else if (type === 'MultiLineString' || type === 'Polygon') {
            newGeometry = [];
            for (const line of feature.geometry) {
                newGeometry.push(shiftLineCoords(line, offset));
            }
        } else if (type === 'MultiPolygon') {
            newGeometry = [];
            for (const polygon of feature.geometry) {
                const newPolygon = [];
                for (const line of polygon) {
                    newPolygon.push(shiftLineCoords(line, offset));
                }
                newGeometry.push(newPolygon);
            }
        }

        newFeatures.push(createFeature(feature.id, type, newGeometry, feature.tags));
    }

    return newFeatures;
}

function shiftPointCoords(coords, offset) {
    const newCoords = [];

    for (let i = 0; i < coords.length; i += 3) {
        newCoords.push(coords[i] + offset, coords[i + 1], coords[i + 2]);
    }

    return newCoords;
}

function shiftLineCoords(line, offset) {
    const newLine = {
        points: [],
        size: line.size
    };

    if (line.start !== undefined) {
        newLine.start = line.start;
        newLine.end = line.end;
    }

    for (let i = 0; i < line.points.length; i += 3) {
        newLine.points.push(line.points[i] + offset, line.points[i + 1], line.points[i + 2]);
    }

    optimizeLineMemory(newLine);

    return newLine;
}
