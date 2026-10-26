const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { haversineMeters, withinRadius } = require('./geo');

describe('geo', () => {
  it('returns ~0 for the same point', () => {
    assert.ok(haversineMeters(18.5204, 73.8567, 18.5204, 73.8567) < 1);
  });

  it('measures a known ~111m north-south step', () => {
    const meters = haversineMeters(18.5204, 73.8567, 18.5214, 73.8567);
    assert.ok(meters > 100 && meters < 120);
  });

  it('blocks check-in outside 100m', () => {
    const meters = haversineMeters(18.5204, 73.8567, 18.5234, 73.8567);
    assert.equal(withinRadius(meters, 100), false);
    assert.equal(withinRadius(75, 100), true);
  });

  it('returns null when a coordinate is missing', () => {
    assert.equal(haversineMeters(18.52, 73.85, null, 73.85), null);
    assert.equal(withinRadius(null, 100), false);
  });
});
