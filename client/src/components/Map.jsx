import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * Leaflet over OpenStreetMap tiles — free, no API key, no billing account.
 * Markers are drawn as divIcons so they inherit the app's theme colours
 * instead of pulling Leaflet's default sprite sheet.
 */

const pin = (color, label) =>
  L.divIcon({
    className: '',
    html: `<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;background:${color};
      transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);
      display:grid;place-items:center;">
      <span style="transform:rotate(45deg);color:#fff;font:700 10px/1 Inter,sans-serif;">${label || ''}</span>
      </div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
  });

const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

export default function Map({
  center,
  markers = [],
  circle,
  zoom = 14,
  size = '',
  onPick,
  fit = false,
}) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);

  useEffect(() => {
    if (map.current || !el.current) return;
    map.current = L.map(el.current, { zoomControl: true, attributionControl: true })
      .setView([center?.lat ?? 19.7515, center?.lng ?? 75.7139], center ? zoom : 6);

    L.tileLayer(TILES, {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map.current);

    layer.current = L.layerGroup().addTo(map.current);

    if (onPick) {
      map.current.on('click', (e) => onPick({ lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) }));
      map.current.getContainer().style.cursor = 'crosshair';
    }

    // Leaflet mis-measures when its container starts hidden (modals, tabs).
    const t = setTimeout(() => map.current?.invalidateSize(), 120);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { map.current?.remove(); map.current = null; }, []);

  useEffect(() => {
    if (!map.current || !layer.current) return;
    layer.current.clearLayers();

    const pts = [];
    for (const m of markers) {
      if (m?.lat == null) continue;
      const mk = L.marker([m.lat, m.lng], { icon: pin(m.color || '#d97706', m.label) }).addTo(layer.current);
      if (m.popup) mk.bindPopup(m.popup);
      pts.push([m.lat, m.lng]);
    }

    if (circle?.lat != null) {
      L.circle([circle.lat, circle.lng], {
        radius: circle.radius || 300,
        color: '#d97706', weight: 1.5, fillColor: '#d97706', fillOpacity: 0.08,
      }).addTo(layer.current);
      pts.push([circle.lat, circle.lng]);
    }

    if (fit && pts.length > 1) {
      map.current.fitBounds(L.latLngBounds(pts), { padding: [34, 34], maxZoom: 16 });
    } else if (center?.lat != null) {
      map.current.setView([center.lat, center.lng], zoom);
    } else if (pts.length === 1) {
      map.current.setView(pts[0], zoom);
    }
  }, [markers, circle, center?.lat, center?.lng, zoom, fit]);

  return <div ref={el} className={`map ${size}`.trim()} />;
}
