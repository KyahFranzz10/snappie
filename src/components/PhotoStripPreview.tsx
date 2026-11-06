import { useEffect, useRef, useState } from "react";
import { compose } from "../features/photostrip/compose";
import type { EditorSettings } from "../types";
export function PhotoStripPreview({
  photos,
  settings,
  logo = "",
  onCanvas,
}: {
  photos: string[];
  settings: EditorSettings;
  logo?: string;
  onCanvas?: (c: HTMLCanvasElement | null) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    onCanvas?.(null);
    compose(photos, settings, logo)
      .then((c) => {
        if (active) {
          holder.current?.replaceChildren(c);
          onCanvas?.(c);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [photos, settings, logo, onCanvas]);
  return (
    <div
      className={`composed-preview ${settings.template}`}
      ref={holder}
      aria-label="Your composed photostrip"
    >
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
