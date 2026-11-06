import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Camera,
  Check,
  RefreshCw,
  RotateCcw,
  X,
  ArrowRight,
  Video,
} from "lucide-react";
import { useCamera } from "../features/camera/useCamera";
import { useBooth } from "../stores/booth";
import {
  canRecordMotion,
  startMotionClip,
  type MotionClipRecorder,
} from "../features/capture/motionClip";
export function Capture() {
  const camera = useCamera();
  const { settings, photos, clips, setPhotos, setClips, mode } = useBooth();
  const navigate = useNavigate();
  const [count, setCount] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState("");
  const [retake, setRetake] = useState<number | null>(null);
  const [saveMotion, setSaveMotion] = useState(false);
  const [clipWarning, setClipWarning] = useState("");
  const [recording, setRecording] = useState(false);
  const motion = useRef<MotionClipRecorder | null>(null);
  const clipsRef = useRef(clips);
  clipsRef.current = clips;
  const abort = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(
    () => () => {
      abort.current?.abort();
      motion.current?.cancel();
    },
    [],
  );
  function wait(ms: number, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => {
        signal.removeEventListener("abort", cancel);
        resolve();
      }, ms);
      const cancel = () => {
        clearTimeout(t);
        reject(new DOMException("Cancelled", "AbortError"));
      };
      signal.addEventListener("abort", cancel, { once: true });
    });
  }
  async function shoot() {
    if (lock.current) return;
    lock.current = true;
    const controller = new AbortController();
    abort.current = controller;
    setRunning(true);
    setError("");
    setClipWarning("");
    try {
      const indexes =
        retake !== null
          ? [retake]
          : Array.from(
              { length: settings.count - photosRef.current.length },
              (_, i) => photosRef.current.length + i,
            );
      for (const i of indexes) {
        if (saveMotion && camera.video.current) {
          try {
            motion.current = startMotionClip(camera.video.current);
            setRecording(true);
          } catch {
            setClipWarning(
              "Could not start countdown video. Still photos will continue.",
            );
          }
        }
        for (let n = settings.countdown; n > 0; n--) {
          setCount(n);
          await wait(1000, controller.signal);
        }
        setCount(null);
        const shot = camera.capture();
        setFlash(true);
        setTimeout(() => setFlash(false), 150);
        const next = [...photosRef.current];
        next[i] = shot;
        photosRef.current = next;
        setPhotos(next);
        const nextClips = [...clipsRef.current];
        nextClips[i] = null;
        clipsRef.current = nextClips;
        setClips(nextClips);
        if (motion.current) {
          try {
            const blob = await motion.current.finish();
            if (!controller.signal.aborted) {
              const updated = [...clipsRef.current];
              updated[i] = blob;
              clipsRef.current = updated;
              setClips(updated);
            }
          } catch (e) {
            if (!(e instanceof DOMException && e.name === "AbortError"))
              setClipWarning(
                "This countdown video could not be saved. Your still photo is safe; you can retake the moment.",
              );
          } finally {
            motion.current = null;
            setRecording(false);
          }
        }
        if (controller.signal.aborted)
          throw new DOMException("Cancelled", "AbortError");
        await wait(400, controller.signal);
      }
      setRetake(null);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        setError(e instanceof Error ? e.message : "Capture failed. Try again.");
    } finally {
      motion.current?.cancel();
      motion.current = null;
      setRecording(false);
      setRunning(false);
      setCount(null);
      lock.current = false;
    }
  }
  const complete = photos.length === settings.count;
  return (
    <section
      className={`page capture-page ${mode === "kiosk" ? "kiosk-capture" : ""}`}
    >
      <div className="capture-heading">
        <div>
          <span className="eyebrow">
            {mode === "kiosk" ? "EVENT BOOTH" : "YOUR LITTLE BOOTH"}
          </span>
          <h1>
            {complete ? "Looking good, memory maker." : "Ready when you are."}
          </h1>
        </div>
        <Link className="back-link" to={mode === "kiosk" ? "/kiosk" : "/setup"}>
          ← {mode === "kiosk" ? "Leave booth" : "Change setup"}
        </Link>
      </div>
      <div className="capture-grid">
        <div>
          <div
            className={`camera-stage ${flash ? "flash" : ""}`}
            style={
              camera.resolution
                ? {
                    aspectRatio: `${camera.resolution.width} / ${camera.resolution.height}`,
                  }
                : undefined
            }
          >
            <video
              ref={camera.video}
              autoPlay
              muted
              playsInline
              className="mirrored"
            />
            {!camera.stream && (
              <div className="camera-empty">
                <span className="camera-illustration">
                  <Camera size={44} />
                </span>
                <h2>A little camera magic.</h2>
                <p>
                  Turn on your camera to step into the booth.
                  <br />
                  Your photos stay on this device.
                </p>
                <button
                  className="button primary"
                  disabled={camera.busy}
                  onClick={() => void camera.start()}
                >
                  <Video size={18} />
                  {camera.busy ? "Opening camera…" : "Enable camera"}
                </button>
              </div>
            )}
            {camera.stream && (
              <>
                <span className="camera-label">
                  <span className="live-dot" />{" "}
                  {recording ? "RECORDING CLIP" : "LIVE"} · MIRRORED
                </span>
                <span className="camera-caption">
                  {retake !== null
                    ? `Retaking shot ${retake + 1}`
                    : `${photos.length} / ${settings.count} little moments`}
                </span>
                <div className="corner top-left" />
                <div className="corner top-right" />
                <div className="corner bottom-left" />
                <div className="corner bottom-right" />
              </>
            )}
            {count !== null && (
              <div
                className="countdown-overlay"
                role="status"
                aria-live="assertive"
              >
                <span key={count}>{count}</span>
                <p>Find your favorite pose</p>
              </div>
            )}
          </div>
          {(camera.error || error) && (
            <div className="error" role="alert">
              {camera.error || error}
              <button
                className="text-button"
                onClick={() => void camera.start()}
              >
                Try camera again
              </button>
            </div>
          )}
          <div className="capture-toolbar">
            {camera.devices.length > 1 && (
              <label className="device-select">
                Camera
                <select
                  disabled={running}
                  aria-label="Camera device"
                  value={camera.selectedDevice}
                  onChange={(e) => void camera.start(e.target.value)}
                >
                  {camera.devices.map((d, i) => (
                    <option value={d.deviceId} key={d.deviceId}>
                      {d.label || `Camera ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <span className="muted">
              {settings.countdown}s countdown · {settings.count} shots
            </span>
            <button
              className="text-button"
              disabled={running || !camera.stream}
              onClick={() => camera.stop()}
            >
              Turn camera off
            </button>
          </div>
          <div className="motion-option">
            <label className="check-label">
              <input
                type="checkbox"
                checked={saveMotion}
                disabled={running || !canRecordMotion()}
                onChange={(e) => setSaveMotion(e.target.checked)}
              />{" "}
              Live photo · save countdown videos
            </label>
            <p>
              {canRecordMotion()
                ? "Records a silent clip during each countdown, then takes the still at zero. Clips stay in this session until you download or reset."
                : "This browser supports still photos, but countdown video recording is unavailable."}
            </p>
            {clipWarning && (
              <p className="feedback" role="status">
                {clipWarning}
              </p>
            )}
          </div>
          {camera.stream && (
            <div className="camera-quality-note" role="status">
              <strong>
                {camera.resolution
                  ? `Camera feed: ${camera.resolution.width} × ${camera.resolution.height} px`
                  : "Checking camera resolution…"}
              </strong>
              <p>
                {camera.resolution && camera.resolution.width < 1280
                  ? "Your camera is sending a lower-resolution feed. Try another camera or check its webcam software settings."
                  : "Local captures preserve the camera feed as PNG; the final layout determines export size."}{" "}
                For less grain, face a soft light and clean the lens. Use the
                Original filter for a natural look.
              </p>
            </div>
          )}
          <div className="capture-actions">
            {running ? (
              <button
                className="button secondary"
                onClick={() => abort.current?.abort()}
              >
                <X size={18} /> Stop sequence
              </button>
            ) : complete && retake === null ? (
              <button
                className="button primary"
                onClick={() => {
                  camera.stop();
                  navigate("/editor");
                }}
              >
                Make it yours <ArrowRight size={18} />
              </button>
            ) : (
              <button
                className="button primary shutter"
                disabled={!camera.ready}
                onClick={() => void shoot()}
              >
                <Camera size={21} />
                {retake !== null
                  ? "Retake this photo"
                  : photos.length
                    ? "Continue capturing"
                    : "Let’s take some photos"}
              </button>
            )}
            <p className="muted">
              {complete
                ? "Love these? Add your finishing touches."
                : "Relax, get close, and let the good times happen."}
            </p>
          </div>
        </div>
        <aside className="capture-sidebar">
          <div className="side-title">
            <h3>Your moments</h3>
            <span>
              {photos.length}/{settings.count}
            </span>
          </div>
          <div className="shot-list">
            {Array.from({ length: settings.count }, (_, i) => (
              <button
                className={`shot-slot ${retake === i ? "active" : ""}`}
                key={i}
                disabled={running || !photos[i]}
                aria-label={`Retake photo ${i + 1}`}
                onClick={() => setRetake(retake === i ? null : i)}
              >
                {photos[i] ? (
                  <>
                    <img alt={`Photo ${i + 1}`} src={photos[i]} />
                    <span>
                      <RefreshCw size={15} /> Retake
                    </span>
                  </>
                ) : (
                  <>
                    <Camera size={22} />
                    <small>Moment {i + 1}</small>
                  </>
                )}
                <i>{photos[i] ? <Check size={12} /> : i + 1}</i>
              </button>
            ))}
          </div>
          <button
            className="text-button centered"
            disabled={running || !photos.length}
            onClick={() => {
              setPhotos([]);
              setClips([]);
              setRetake(null);
            }}
          >
            <RotateCcw size={15} /> Start fresh
          </button>
        </aside>
      </div>
    </section>
  );
}
