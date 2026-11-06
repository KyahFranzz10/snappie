import { useEffect, useRef, useState } from "react";
import { Download, Video, X } from "lucide-react";
import { useBooth } from "../stores/booth";
import { composeFramedVideo } from "../features/photostrip/framedVideo";
export function FramedMotionVideo({ onActivity }: { onActivity?: () => void }) {
  const { photos, clips, editor, kiosk, mode, settings } = useBooth();
  const logo = mode === "kiosk" ? kiosk.logo : "";
  const [blob, setBlob] = useState<Blob | null>(null),
    [url, setUrl] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    controller.current?.abort();
    setBlob(null);
    setBusy(false);
    setError("");
    return () => controller.current?.abort();
  }, [photos, clips, editor, logo]);
  useEffect(() => {
    if (!blob) {
      setUrl("");
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  async function generate() {
    if (busy) return;
    onActivity?.();
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setError("");
    setBlob(null);
    setProgress(0);
    try {
      const video = await composeFramedVideo(
        photos,
        clips,
        editor,
        logo,
        settings.countdown,
        current.signal,
        (p) => setProgress(Math.round(p * 100)),
      );
      if (!current.signal.aborted) setBlob(video);
    } catch (e) {
      if (!current.signal.aborted)
        setError(
          e instanceof Error ? e.message : "Could not create framed video.",
        );
    } finally {
      if (!current.signal.aborted) setBusy(false);
    }
  }
  const extension = blob?.type.startsWith("video/mp4") ? "mp4" : "webm";
  return (
    <div className="framed-video-export">
      <p>
        The moving clips play together inside your selected frame, then finish
        on the still photos. Includes your layout, filters, caption, text,
        stickers, date, and event logo.
      </p>
      {editor.frame === "transparent" && (
        <p className="small muted">
          Video uses a cream background for transparent frames. Your PNG keeps
          its transparency.
        </p>
      )}
      {url && (
        <video
          className={`framed-video-preview ${editor.template}`}
          aria-label="Framed video preview"
          src={url}
          controls
          playsInline
          onPlay={onActivity}
        />
      )}
      {busy ? (
        <div className="framed-export-progress">
          <p role="status">
            Creating framed video… {progress}% · Keep this tab visible.
          </p>
          <button
            className="button secondary small"
            onClick={() => {
              controller.current?.abort();
              setBusy(false);
            }}
          >
            <X size={15} /> Cancel export
          </button>
        </div>
      ) : (
        <button className="button primary" onClick={() => void generate()}>
          <Video size={17} />
          {blob ? "Create framed video again" : "Create framed video"}
        </button>
      )}
      {url && (
        <a
          className="button secondary"
          href={url}
          download={`snappie-framed-${editor.template}.${extension}`}
        >
          <Download size={17} /> Download framed video
        </a>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
