import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Download,
  Printer,
  Save,
  GripVertical,
  Check,
  Sparkles,
  Trash2,
  Share2,
} from "lucide-react";
import { useBooth } from "../stores/booth";
import { PhotoStripPreview } from "../components/PhotoStripPreview";
import { MotionClips } from "../components/MotionClips";
import { downloadCanvas, printCanvas } from "../features/photostrip/compose";
import { saveDraft, deleteDraft } from "../services/storage/drafts";
import type { Filter, Template } from "../types";
const frames = [
  ["Petal", "#f4dce3"],
  ["Cream", "#fff8e9"],
  ["Lilac", "#e3dcf4"],
  ["Sage", "#d9e3d4"],
  ["Midnight", "#302a36"],
  ["Cherry", "#9d3853"],
  ["Clear", "transparent"],
];
export function Editor({ result = false }: { result?: boolean }) {
  const {
    photos,
    clips,
    editor,
    setEditor,
    setPhotos,
    setClips,
    mode,
    kiosk,
    reset,
  } = useBooth();
  const navigate = useNavigate();
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  const [shareFile, setShareFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const drag = useRef<number | null>(null);
  const onCanvas = useCallback((c: HTMLCanvasElement | null) => {
    canvas.current = c;
    setReady(!!c);
  }, []);
  const [remaining, setRemaining] = useState(kiosk.reset);
  useEffect(() => {
    let active = true;
    setShareFile(null);
    if (ready && canvas.current)
      canvas.current.toBlob((blob) => {
        if (active && blob)
          setShareFile(
            new File([blob], `snappie-${editor.template}.png`, {
              type: "image/png",
            }),
          );
      }, "image/png");
    return () => {
      active = false;
    };
  }, [ready, editor, photos]);
  async function share() {
    if (!shareFile) return;
    try {
      if (!navigator.share || !navigator.canShare?.({ files: [shareFile] })) {
        setMessage(
          "File sharing isn’t supported here. Download the image, then select it in Instagram or Facebook → Create story.",
        );
        return;
      }
      await navigator.share({
        files: [shareFile],
        title: "A little Snappie memory",
      });
      setMessage(
        "Image shared with your selected app. Finish posting in that app.",
      );
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        setMessage(
          "Could not open device sharing. Download the image and add it to your story manually.",
        );
    }
  }
  useEffect(() => {
    if (!(result && mode === "kiosk")) return;
    setRemaining(kiosk.reset);
    const t = setInterval(() => setRemaining((r) => r - 1), 1000);
    return () => clearInterval(t);
  }, [result, mode, kiosk.reset]);
  useEffect(() => {
    if (result && mode === "kiosk" && remaining <= 0) {
      reset();
      navigate("/kiosk", { replace: true });
    }
  }, [remaining, result, mode, navigate, reset]);
  async function download(type: "png" | "jpeg") {
    if (!canvas.current) return;
    try {
      await downloadCanvas(canvas.current, type);
      setMessage("Your memory is ready to keep. Download started.");
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Download failed. Please try again.",
      );
    }
  }
  async function save() {
    if (mode === "kiosk") return;
    try {
      await saveDraft(photos, editor);
      setMessage("Draft saved on this device.");
    } catch {
      setMessage(
        "Could not save. Your browser storage may be full or unavailable.",
      );
    }
  }
  function move(from: number, to: number) {
    if (from === to) return;
    const next = [...photos];
    const [p] = next.splice(from, 1);
    next.splice(to, 0, p);
    setPhotos(next);
    const nextClips = Array.from(
      { length: photos.length },
      (_, i) => clips[i] || null,
    );
    const [clip] = nextClips.splice(from, 1);
    nextClips.splice(to, 0, clip || null);
    setClips(nextClips);
  }
  if (!photos.length)
    return (
      <section className="empty-page">
        <CameraEmpty />
        <h1>Your story is still waiting.</h1>
        <p>Take some photos to start making your keepsake.</p>
        <Link className="button primary" to="/setup">
          Step into the booth <ArrowRight size={17} />
        </Link>
      </section>
    );
  return (
    <section className="page editor-page">
      <div className="page-title">
        <span className="eyebrow">
          {result ? "A LITTLE MOMENT, YOURS FOREVER" : "THE FINISHING TOUCHES"}
        </span>
        <h1>
          {result ? "A keeper. Just like you." : "Make it a little more you."}
        </h1>
        <p>
          {result
            ? "Download it. Print it. Stick it on your fridge."
            : "Pick a frame, add some personality, and keep the good stuff."}
        </p>
      </div>
      <div className="editor-grid">
        <div className="editor-preview-area">
          <PhotoStripPreview
            photos={photos}
            settings={editor}
            logo={mode === "kiosk" ? kiosk.logo : ""}
            onCanvas={onCanvas}
          />
          <div className="preview-meta">
            <Check size={14} />{" "}
            {editor.template === "strip"
              ? "600 × 1800 px · 2 × 6 in"
              : editor.template === "story"
                ? "1080 × 1920 px · 9:16 story"
                : "1800 × 1200 px · 4 × 6 in"}{" "}
            {editor.template !== "story" && "· 300 px/in"}
          </div>
          <p className="handwritten">looks like a good memory ♡</p>
        </div>
        <div className="panel editor-controls">
          {result ? (
            <>
              <span className="success-medal">
                <Check size={30} />
              </span>
              <h2>Your moments, ready to go.</h2>
              <p className="muted">
                Your full-resolution keepsake is composed from your original
                captures.
              </p>
              <label>
                Output size
                <select
                  value={editor.template}
                  onChange={(e) =>
                    setEditor({ template: e.target.value as Template })
                  }
                >
                  <option value="strip">Classic 2 × 6 strip</option>
                  <option value="postcard">4 × 6 postcard</option>
                  <option value="story">
                    Facebook / Instagram Story · 1080 × 1920
                  </option>
                </select>
              </label>
              <button
                className="button primary full"
                disabled={!ready}
                onClick={() => void download("png")}
              >
                <Download size={18} /> Download PNG
              </button>
              <button
                className="button secondary full"
                disabled={!ready}
                onClick={() => void download("jpeg")}
              >
                <Download size={18} /> Download JPG
              </button>
              <button
                className="button secondary full"
                disabled={!ready || !shareFile}
                onClick={() => void share()}
              >
                <Share2 size={18} /> Share image
              </button>
              <p className="small muted">
                For Facebook or Instagram, choose the Story size, download, then
                add the image in the app’s Create story screen. Device sharing
                shows available apps; posting is completed in your chosen app.
              </p>
              {editor.template !== "story" && (
                <>
                  <button
                    className="button secondary full"
                    disabled={!ready}
                    onClick={() =>
                      canvas.current &&
                      printCanvas(canvas.current, editor.template)
                    }
                  >
                    <Printer size={18} /> Print your keepsake
                  </button>
                  <p className="small muted">
                    Opens your browser’s print dialog. Select actual size / 100%
                    and matching paper. Printers may add margins.
                  </p>
                </>
              )}
              <button
                className="text-button centered"
                onClick={() => navigate("/editor")}
              >
                ← Back to the little details
              </button>
              <hr />
              <button
                className="button secondary full"
                onClick={() => {
                  reset();
                  navigate(mode === "kiosk" ? "/kiosk" : "/setup");
                }}
              >
                Make another memory <ArrowRight size={17} />
              </button>
              {mode === "kiosk" && (
                <p className="muted" role="status">
                  Booth resets in {remaining}s.{" "}
                  <button
                    className="text-button"
                    onClick={() => setRemaining(kiosk.reset)}
                  >
                    I need more time
                  </button>
                </p>
              )}
            </>
          ) : (
            <>
              <div className="field-group">
                <h3>
                  01 <span>A frame for your memories</span>
                </h3>
                <div className="frame-swatches">
                  {frames.map(([name, color]) => (
                    <button
                      key={name}
                      className={editor.frame === color ? "chosen" : ""}
                      onClick={() => setEditor({ frame: color })}
                      aria-label={`${name} frame`}
                      aria-pressed={editor.frame === color}
                    >
                      <i
                        style={{ background: color }}
                        className={color === "transparent" ? "checker" : ""}
                      />
                      <small>{name}</small>
                    </button>
                  ))}
                </div>
              </div>
              <div className="field-group">
                <h3>
                  02 <span>Find your feeling</span>
                </h3>
                <div className="filter-options">
                  {(
                    [
                      "original",
                      "mono",
                      "vintage",
                      "warm",
                      "cool",
                      "film",
                    ] as Filter[]
                  ).map((f) => (
                    <button
                      key={f}
                      className={editor.filter === f ? "selected" : ""}
                      onClick={() => setEditor({ filter: f })}
                    >
                      {f === "mono" ? "B&W" : f}
                    </button>
                  ))}
                </div>
                {(["brightness", "contrast", "saturation"] as const).map(
                  (k) => (
                    <label className="slider-label" key={k}>
                      {k}
                      <input
                        aria-label={k}
                        type="range"
                        min="40"
                        max="160"
                        value={editor[k]}
                        onChange={(e) => setEditor({ [k]: +e.target.value })}
                      />
                      <span>{editor[k]}%</span>
                    </label>
                  ),
                )}
              </div>
              <div className="field-group">
                <h3>
                  03 <span>A little personality</span>
                </h3>
                <label>
                  Caption
                  <input
                    maxLength={65}
                    value={editor.caption}
                    onChange={(e) => setEditor({ caption: e.target.value })}
                  />
                </label>
                <div className="sticker-options">
                  {["", "✦", "♡", "★", "✿", "☻", "🎀", "🍒"].map((s) => (
                    <button
                      key={s}
                      aria-label={s || "No sticker"}
                      aria-pressed={editor.sticker === s}
                      className={editor.sticker === s ? "selected" : ""}
                      onClick={() => setEditor({ sticker: s })}
                    >
                      {s || "∅"}
                    </button>
                  ))}
                </div>
                <label>
                  Text overlay
                  <input
                    maxLength={60}
                    placeholder="Write a little something…"
                    value={editor.text}
                    onChange={(e) => setEditor({ text: e.target.value })}
                  />
                </label>
                {editor.text && (
                  <>
                    <label className="slider-label">
                      Horizontal
                      <input
                        type="range"
                        aria-label="Text horizontal position"
                        min="10"
                        max="90"
                        value={editor.textX}
                        onChange={(e) => setEditor({ textX: +e.target.value })}
                      />
                    </label>
                    <label className="slider-label">
                      Vertical
                      <input
                        type="range"
                        aria-label="Text vertical position"
                        min="5"
                        max="95"
                        value={editor.textY}
                        onChange={(e) => setEditor({ textY: +e.target.value })}
                      />
                    </label>
                  </>
                )}
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={editor.date}
                    onChange={(e) => setEditor({ date: e.target.checked })}
                  />{" "}
                  Add today’s date
                </label>
                {editor.date && (
                  <label>
                    Date (leave blank for today)
                    <input
                      type="date"
                      value={editor.dateValue}
                      onChange={(e) => setEditor({ dateValue: e.target.value })}
                    />
                  </label>
                )}
                <label>
                  Layout
                  <select
                    value={editor.template}
                    onChange={(e) =>
                      setEditor({
                        template: e.target.value as Template,
                      })
                    }
                  >
                    <option value="strip">Classic 2 × 6 strip</option>
                    <option value="postcard">4 × 6 postcard</option>
                    <option value="story">
                      Facebook / Instagram Story · 1080 × 1920
                    </option>
                  </select>
                </label>
              </div>
              <div className="field-group">
                <h3>
                  04 <span>Every moment, in its place</span>
                </h3>
                <p className="small muted">
                  Drag photos to rearrange, or use the arrow buttons.
                </p>
                <div className="reorder-photos">
                  {photos.map((p, i) => (
                    <div
                      key={i}
                      draggable
                      onDragStart={() => (drag.current = i)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (drag.current !== null) move(drag.current, i);
                        drag.current = null;
                      }}
                    >
                      <GripVertical size={14} />
                      <img src={p} alt={`Moment ${i + 1}`} />
                      <span>{i + 1}</span>
                      <button
                        aria-label={`Move photo ${i + 1} earlier`}
                        disabled={i === 0}
                        onClick={() => move(i, i - 1)}
                      >
                        ↑
                      </button>
                      <button
                        aria-label={`Move photo ${i + 1} later`}
                        disabled={i === photos.length - 1}
                        onClick={() => move(i, i + 1)}
                      >
                        ↓
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <button
                className="button primary full"
                onClick={() => navigate("/result")}
              >
                This is the one <ArrowRight size={18} />
              </button>
              {mode !== "kiosk" && (
                <>
                  <button
                    className="text-button centered"
                    onClick={() => void save()}
                  >
                    <Save size={15} /> Save a draft on this device
                  </button>
                  <button
                    className="text-button centered"
                    onClick={() =>
                      void deleteDraft()
                        .then(() => setMessage("Saved draft deleted."))
                        .catch(() => setMessage("Could not delete draft."))
                    }
                  >
                    <Trash2 size={14} /> Delete saved draft
                  </button>
                </>
              )}
            </>
          )}
          {message && (
            <p className="feedback" role="status">
              {message}
            </p>
          )}
        </div>
      </div>
      {result && (
        <MotionClips
          onActivity={
            mode === "kiosk" ? () => setRemaining(kiosk.reset) : undefined
          }
        />
      )}
    </section>
  );
}
function CameraEmpty() {
  return <Sparkles className="empty-icon" size={40} />;
}
