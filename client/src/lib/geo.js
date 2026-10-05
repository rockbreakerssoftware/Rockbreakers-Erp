import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * High-accuracy position with live state. The browser Geolocation API is
 * free and needs no key; it requires HTTPS, which Render provides.
 */
export function useGeolocation({ watch = true } = {}) {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | locating | ready | denied | unavailable
  const watchId = useRef(null);

  const handle = useCallback((pos) => {
    setPosition({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: Math.round(pos.coords.accuracy),
      at: new Date(pos.timestamp).toISOString(),
    });
    setStatus('ready');
    setError(null);
  }, []);

  const fail = useCallback((err) => {
    if (err.code === 1) {
      setStatus('denied');
      setError('Location permission was blocked. Enable it in your browser settings and reload.');
    } else if (err.code === 2) {
      setStatus('unavailable');
      setError('Your location could not be determined. Move to open sky and try again.');
    } else {
      setStatus('unavailable');
      setError('Finding your location took too long. Try again.');
    }
  }, []);

  const start = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus('unavailable');
      setError('This device does not support location.');
      return;
    }
    setStatus('locating');
    const opts = { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 };
    navigator.geolocation.getCurrentPosition(handle, fail, opts);
    if (watch && watchId.current == null) {
      watchId.current = navigator.geolocation.watchPosition(handle, fail, opts);
    }
  }, [handle, fail, watch]);

  useEffect(() => {
    start();
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    };
  }, [start]);

  return { position, error, status, retry: start };
}

/** Metres between two points. Matches the server's geofence computation. */
export function haversine(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)));
}

export const formatDistance = (m) =>
  m == null ? '—' : m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;

export const accuracyTone = (m) => (m == null ? 'bad' : m <= 30 ? 'ok' : m <= 100 ? 'warn' : 'bad');
