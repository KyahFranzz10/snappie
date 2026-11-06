import { useEffect, useState } from "react";
import { Download, Video } from "lucide-react";
import { useBooth } from "../stores/booth";
import { FramedMotionVideo } from "./FramedMotionVideo";
function MotionClip({ blob, index }: { blob: Blob; index: number }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  const extension = blob.type.startsWith("video/mp4") ? "mp4" : "webm";
  return (
    <article>
      <video
        src={url || undefined}
        controls
        playsInline
        preload="metadata"
        aria-label={`Countdown video ${index + 1}`}
      />
      <a
        className="button secondary full"
        href={url || undefined}
        download={`snappie-countdown-${index + 1}.${extension}`}
      >
        <Download size={16} /> Download video {index + 1}
      </a>
    </article>
  );
}
export function MotionClips({ onActivity }: { onActivity?: () => void }) {
  const clips = useBooth((s) => s.clips);
  if (!clips.some(Boolean)) return null;
  return (
    <section className="panel motion-clips">
      <h2>
        <Video size={23} /> The moments before the photo.
      </h2>
      <p>
        Turn your countdown clips into a moving keepsake with the same frame as
        your photo. Video format depends on your browser (MP4 or WebM).
      </p>
      <FramedMotionVideo onActivity={onActivity} />
      <details className="raw-motion-clips">
        <summary>Individual camera clips (without frame)</summary>
        <div className="motion-clip-grid">
          {clips.map((clip, i) =>
            clip ? <MotionClip key={i} blob={clip} index={i} /> : null,
          )}
        </div>
      </details>
      <p className="muted small">
        Download clips before starting fresh, closing this tab, or the kiosk
        reset. Saved drafts contain still photos only. These are separate video
        files, not native iPhone Live Photos.
      </p>
    </section>
  );
}
