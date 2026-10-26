const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { kmFromMeters, travelKmBetween } = require('./travelKm');

describe('travelKm', () => {
  it('rounds meters to one decimal km', () => {
    assert.equal(kmFromMeters(25400), 25.4);
    assert.equal(kmFromMeters(null), 0);
  });

  it('computes Noida-scale distance from two points', () => {
    const km = travelKmBetween({ lat: 28.5355, lng: 77.391 }, { lat: 28.6139, lng: 77.209 });
    assert.ok(km > 15 && km < 30);
  });
});
