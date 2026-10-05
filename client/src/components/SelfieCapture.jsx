import { useEffect, useRef, useState, useCallback } from 'react';
import Icon from './Icon';
import { Button, Banner } from './ui';
import { useGeolocation, haversine, formatDistance, accuracyTone } from '../lib/geo';

/**
 * Camera-only selfie plus a live location fix.
 *
 * Gallery upload is deliberately impossible here: the whole value of the
 * control is that the photo was taken now, at this place. The image is
 * resized and compressed in the browser before it ever reaches the server,
 * because these are stored in a 512 MB free-tier database.
 */
export default function SelfieCapture({ onCapture, target, geofenceRadius = 300, busy, actionLabel = 'Confirm' }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [shot, setShot] = useState(null);
  const [camera, setCamera] = useState('starting'); // starting | live | denied | missing
  const [cameraError, setCameraError] = useState(null);
  const { position, status: geoStatus, error: geoError, retry } = useGeolocation();

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setCamera('starting');
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCamera('live');
    } catch (e) {
      setCamera(e.name === 'NotAllowedError' ? 'denied' : 'missing');
      setCameraError(
        e.name === 'NotAllowedError'
          ? 'Camera permission was blocked. Enable it in your browser settings, then reload this page.'
          : 'No camera was found on this device.',
      );
    }
  }, []);

  useEffect(() => {
    start();
    return stop;
  }, [start, stop]);

  const take = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;

    // Resize to 640px on the long edge — legible as evidence, ~60 KB on the wire.
    const MAX = 640;
    const scale = Math.min(1, MAX / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.round(video.videoWidth * scale);
    const h = Math.round(video.videoHeight * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.translate(w, 0);
    ctx.scale(-1, 1); // un-mirror so the saved photo reads naturally
    ctx.drawImage(video, 0, 0, w, h);

    setShot({ dataUrl: canvas.toDataURL('image/jpeg', 0.72), at: new Date().toISOString() });
    stop();
  };

  const retake = () => { setShot(null); start(); };

  const distance = target && position ? haversine(position, target) : null;
  const outside = distance != null && distance > geofenceRadius;
  const ready = shot && position;

  const submit = () => {
    if (!ready) return;
    onCapture({
      selfie: shot.dataUrl,
      lat: position.lat,
      lng: position.lng,
      accuracy: position.accuracy,
      capturedAt: shot.at,
    });
  };

  const tone = accuracyTone(position?.accuracy);

  return (
    <div className="selfie">
      <div className="selfie-stage">
        {shot ? (
          <img src={shot.dataUrl} alt="Captured selfie" />
        ) : camera === 'live' || camera === 'starting' ? (
          <>
            <video ref={videoRef} playsInline muted autoPlay />
            <div className="selfie-ring" />
            {camera === 'starting' && (
              <div className="placeholder" style={{ position: 'absolute' }}>
                <span className="spinner" /> Starting camera…
              </div>
            )}
          </>
        ) : (
          <div className="placeholder">
            <Icon name="camera" size={26} />
            <span>{cameraError}</span>
          </div>
        )}

        {(shot || camera === 'live') && (
          <div className="selfie-badge">
            <span className={`dot ${geoStatus === 'ready' ? tone : 'bad'}`} />
            {geoStatus === 'ready' ? (
              <span>
                {position.lat.toFixed(5)}, {position.lng.toFixed(5)} · ±{position.accuracy} m
                {distance != null && <> · {formatDistance(distance)} from site</>}
              </span>
            ) : geoStatus === 'locating' ? (
              <span>Finding your location…</span>
            ) : (
              <span>Location unavailable</span>
            )}
          </div>
        )}
      </div>

      {geoError && (
        <Banner tone="bad" icon="alert" actions={<Button size="sm" onClick={retry}>Retry</Button>}>
          {geoError}
        </Banner>
      )}

      {outside && (
        <Banner tone="warn" icon="alert">
          You are {formatDistance(distance)} from the registered site centre, outside its {geofenceRadius} m
          boundary. You can still check in — it will be flagged for your manager to review.
        </Banner>
      )}

      {camera === 'denied' && (
        <Banner tone="bad" icon="alert" actions={<Button size="sm" onClick={start}>Try again</Button>}>
          {cameraError}
        </Banner>
      )}

      <div className="row" style={{ gap: 'var(--s2)' }}>
        {shot ? (
          <>
            <Button icon="refresh" onClick={retake} disabled={busy}>Retake</Button>
            <Button variant="primary" className="grow" icon="check" onClick={submit}
              loading={busy} disabled={!ready}>
              {position ? actionLabel : 'Waiting for location…'}
            </Button>
          </>
        ) : (
          <Button variant="primary" className="block" icon="camera" onClick={take} disabled={camera !== 'live'}>
            Take selfie
          </Button>
        )}
      </div>

      <p className="xs subtle" style={{ textAlign: 'center' }}>
        The photo is taken by the camera now — it cannot be chosen from your gallery.
        Your location and the time are recorded with it.
      </p>
    </div>
  );
}
