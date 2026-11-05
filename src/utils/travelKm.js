const { haversineMeters } = require('./geo');

function kmFromMeters(meters) {
  if (meters == null || !Number.isFinite(Number(meters))) return 0;
  return Math.round((Number(meters) / 1000) * 10) / 10;
}

function travelKmBetween(from, to) {
  const meters = haversineMeters(from?.lat, from?.lng, to?.lat, to?.lng);
  return kmFromMeters(meters);
}

module.exports = { kmFromMeters, travelKmBetween };
