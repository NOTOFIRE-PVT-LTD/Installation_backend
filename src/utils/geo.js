const { DEFAULT_VISIT_GEOFENCE_METERS } = require('../config/constants');

function toCoord(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const aLat = toCoord(lat1);
  const aLng = toCoord(lng1);
  const bLat = toCoord(lat2);
  const bLng = toCoord(lng2);
  if (aLat == null || aLng == null || bLat == null || bLng == null) return null;

  // shortcut: haversine not geodesic, upgrade if survey-grade GPS is required
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function withinRadius(distanceMeters, radiusMeters = DEFAULT_VISIT_GEOFENCE_METERS) {
  if (distanceMeters == null) return false;
  return distanceMeters <= radiusMeters;
}

module.exports = { haversineMeters, withinRadius, toCoord };
