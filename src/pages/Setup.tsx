import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Camera,
  Clock3,
  LayoutTemplate,
  ShieldCheck,
  RotateCcw,
} from "lucide-react";
import { useState } from "react";
import { useBooth } from "../stores/booth";
import { loadDraft } from "../services/storage/drafts";
import type { ShotCount } from "../types";
export function Setup() {
  const {
    settings,
    setSettings,
    setEditor,
    setPhotos,
    setClips,
    setMode,
    reset,
  } = useBooth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  async function restore() {
    try {
      const d = await loadDraft();
      if (!d) {
        setError("No saved draft yet. Your next little moment is waiting.");
        return;
      }
      setPhotos(d.photos);
      setClips([]);
      setEditor({ ...d.editor, photoTransforms: d.editor.photoTransforms });
      navigate("/editor");
    } catch {
      setError("Draft storage is unavailable in this browser.");
    }
  }
  return (
    <section className="page narrow">
      <Link to="/modes" className="back-link">
        ← All booths
      </Link>
      <div className="page-title">
        <span className="eyebrow">THE LITTLE SOLO BOOTH</span>
        <h1>Make room for a little fun.</h1>
        <p>Set the scene. We’ll take care of the countdown.</p>
      </div>
      <div className="setup-grid">
        <div className="panel settings-panel">
          <div className="field-group">
            <h3>
              <Camera size={18} /> How many moments?
            </h3>
            <div className="segmented">
              {([2, 3, 4, 6] as ShotCount[]).map((n) => (
                <button
                  aria-pressed={settings.count === n}
                  className={settings.count === n ? "selected" : ""}
                  onClick={() => setSettings({ count: n })}
                  key={n}
                >
                  {n} shots
                </button>
              ))}
            </div>
          </div>
          <div className="field-group">
            <h3>
              <Clock3 size={18} /> A moment to get ready
            </h3>
            <div className="segmented">
              {([3, 5, 10] as const).map((n) => (
                <button
                  aria-pressed={settings.countdown === n}
                  className={settings.countdown === n ? "selected" : ""}
                  onClick={() => setSettings({ countdown: n })}
                  key={n}
                >
                  {n} seconds
                </button>
              ))}
            </div>
          </div>
          <div className="field-group">
            <h3>
              <LayoutTemplate size={18} /> Pick your keepsake
            </h3>
            <div className="template-options">
              {(["strip", "postcard"] as const).map((t) => (
                <button
                  className={settings.template === t ? "selected" : ""}
                  key={t}
                  onClick={() => setSettings({ template: t })}
                >
                  <div className={`layout-icon ${t}`}>
                    {Array.from({ length: settings.count }, (_, i) => (
                      <i key={i} />
                    ))}
                  </div>
                  <strong>
                    {t === "strip"
                      ? "The classic strip"
                      : "The little postcard"}
                  </strong>
                  <small>
                    {t === "strip"
                      ? "2 × 6 inches · 600 × 1800 px"
                      : "4 × 6 inches · 1800 × 1200 px"}
                  </small>
                </button>
              ))}
            </div>
          </div>
          <button
            className="button primary full"
            onClick={() => {
              reset();
              setMode("solo");
              setEditor({ template: settings.template });
              navigate("/capture");
            }}
          >
            Open my booth <ArrowRight size={18} />
          </button>
          <button
            onClick={() => void restore()}
            className="text-button centered"
          >
            <RotateCcw size={14} /> Pick up a saved draft
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
        <aside className="setup-aside">
          <div className="big-layout" style={{ background: "#f4dce3" }}>
            {Array.from({ length: settings.count }, (_, i) => (
              <div key={i}>
                <Camera size={27} />
                <small>0{i + 1}</small>
              </div>
            ))}
            <strong>snappie ✳</strong>
            <small>your good side is every side</small>
          </div>
          <p className="handwritten">a little something to keep ♡</p>
          <p className="muted">
            <ShieldCheck size={16} /> No account. No uploads.
            <br />
            Just a camera and a good time.
          </p>
        </aside>
      </div>
    </section>
  );
}
