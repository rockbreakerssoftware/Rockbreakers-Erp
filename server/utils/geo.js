const R = 6371000; // earth radius, metres
const rad = (d) => (d * Math.PI) / 180;

/** Great-circle distance in metres between two lat/lng points. */
function haversine(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)));
}

/**
 * Reverse geocode via Nominatim (OpenStreetMap) — free, no key.
 * Rate limited to ~1 req/sec, so we call it once per check-in and cache the
 * result on the record. Never throws: an address is nice to have, the
 * coordinates are the evidence.
 */
async function reverseGeocode(lat, lng) {
  if (lat == null || lng == null) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Rockbreakers-FSM/1.0 (field service management)' },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = await res.json();
    return json.display_name || null;
  } catch {
    return null;
  }
}

/** Flags that make a geo-tagged selfie suspicious. Advisory, never blocking. */
function presenceFlags({ accuracy, deviceAt, serverAt, mocked }) {
  const flags = [];
  if (mocked) flags.push('MOCK_LOCATION');
  if (accuracy != null && accuracy > 150) flags.push('LOW_ACCURACY');
  if (deviceAt && serverAt) {
    const skew = Math.abs(new Date(serverAt) - new Date(deviceAt));
    if (skew > 10 * 60 * 1000) flags.push('CLOCK_SKEW');
  }
  return flags;
}

const todayKey = (d = new Date()) => {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};

module.exports = { haversine, reverseGeocode, presenceFlags, todayKey };
