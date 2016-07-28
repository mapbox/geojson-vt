var test = require('tape');
var geojsonvt = require('../src/index');

var leftPoint = {
  type: 'Feature',
  properties: {},
  geometry: {
    coordinates: [-460, 0],
    type: 'Point'
  }
};

var rightPoint = {
  type: 'Feature',
  properties: {},
  geometry: {
    coordinates: [460, 0],
    type: 'Point'
  }
};

test('handle point only in the rightside world', function(t) {
  try {
    geojsonvt(rightPoint);
  }
  catch (err) {
    t.ifError(err);
  }
  t.end();
});

test('handle point only in the leftside world', function(t) {
  try {
    geojsonvt(leftPoint);
  }
  catch (err) {
    t.ifError(err);
  }
  t.end();
});

test('handle points in the leftside world and the rightside world', function(t) {
  try {
    var vt = geojsonvt({
      type: 'FeatureCollection',
      features: [leftPoint, rightPoint]
    });
  }
  catch (err) {
    t.ifError(err);
  }
  t.end();
});

test('handle a point from a world far far away', function(t) {
  var point = {
    type: 'Feature',
    properties: {},
    geometry: {
      coordinates: [-3680, 0],
      type: 'Point'
    }
  };

  try {
    var vt = geojsonvt(point);
    var lng = vt.tiles[0].features[0].geometry[0][0];
    // should be very close to .22222222
    t.equal(lng < .2223, true);
    t.equal(lng > .2221, true);
  }
  catch (err) {
    t.ifError(err);
  }
  t.end();
});
