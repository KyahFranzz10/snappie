import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Camera,
  Maximize,
  Settings,
  ArrowRight,
  LockKeyhole,
} from "lucide-react";
import { useBooth } from "../stores/booth";
import type { Template } from "../types";
export async function hashPin(pin: string) {
  const data = new TextEncoder().encode(`snapbooth-kiosk:${pin}`);
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)))
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export function Kiosk() {
  const { kiosk, reset, setMode, setEditor, settings } = useBooth();
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const idle = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        reset();
        setMessage("Your booth is ready for the next memory.");
      }, 120000);
    };
    idle();
    window.addEventListener("pointerdown", idle);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("pointerdown", idle);
    };
  }, [reset]);
  return (
    <section className="kiosk-welcome">
      <div className="kiosk-top">
        <span className="eyebrow">WELCOME TO THE GOOD TIMES</span>
        <div>
          <button
            aria-label="Enter fullscreen"
            className="icon-button"
            onClick={() =>
              void document.documentElement
                .requestFullscreen?.()
                .catch(() =>
                  setMessage(
                    "Fullscreen is unavailable. You can still use the booth.",
                  ),
                )
            }
          >
            <Maximize size={21} />
          </button>
          <Link
            className="icon-button"
            aria-label="Kiosk settings"
            to="/kiosk/settings"
          >
            <Settings size={21} />
          </Link>
        </div>
      </div>
      <div className="kiosk-center">
        {kiosk.logo ? (
          <img className="event-logo" src={kiosk.logo} alt="Event logo" />
        ) : (
          <div className="kiosk-camera">
            <Camera size={53} />
            <span>✳</span>
          </div>
        )}
        <span className="eyebrow">
          {kiosk.date &&
            new Date(`${kiosk.date}T12:00:00`).toLocaleDateString(undefined, {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
        </span>
        <h1>{kiosk.event}</h1>
        <p>Good people. Great poses. A little something to remember.</p>
        <button
          className="button primary kiosk-start"
          onClick={() => {
            reset();
            setMode("kiosk");
            setEditor({
              caption: kiosk.event,
              dateValue: kiosk.date,
              template: settings.template,
              ...(settings.template === "polaroid" && {
                frame: "#fffaf5",
                sticker: "",
              }),
            });
            navigate("/capture");
          }}
        >
          Tap to make a memory <ArrowRight size={25} />
        </button>
        <span className="handwritten">everyone’s invited to squeeze in ♡</span>
        {message && <p role="status">{message}</p>}
      </div>
      <p className="kiosk-bottom">
        POWERED BY SNAPPIE ✳ &nbsp; · &nbsp; YOUR PHOTOS STAY RIGHT HERE
      </p>
    </section>
  );
}
export function KioskSettings() {
  const { kiosk, setKiosk, settings, setSettings } = useBooth();
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [message, setMessage] = useState("");
  async function unlock() {
    if ((await hashPin(pin)) === kiosk.pinHash) setUnlocked(true);
    else setMessage("That PIN doesn’t match. Try again.");
  }
  async function setPassword() {
    if (!/^\d{4,8}$/.test(newPin)) {
      setMessage("Choose a PIN with 4–8 digits.");
      return;
    }
    setKiosk({ pinHash: await hashPin(newPin) });
    setUnlocked(true);
    setNewPin("");
    setMessage("Admin PIN saved on this device.");
  }
  const protectedSettings = !!kiosk.pinHash;
  return (
    <section className="page settings-page narrow">
      <Link to="/kiosk" className="back-link">
        ← Back to event booth
      </Link>
      <div className="page-title">
        <span className="eyebrow">BEHIND THE BOOTH</span>
        <h1>A few event details.</h1>
        <p>Set it up once. Let the good times roll.</p>
      </div>
      <div className="panel settings-panel">
        {protectedSettings && !unlocked ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void unlock();
            }}
          >
            <LockKeyhole size={28} />
            <h2>For the host’s eyes.</h2>
            <label>
              Admin PIN
              <input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                autoComplete="off"
              />
            </label>
            <button className="button primary full">Unlock settings</button>
          </form>
        ) : (
          <>
            {!protectedSettings && (
              <div className="notice-block">
                <h3>Set an admin PIN first</h3>
                <p>
                  Keep guests from casually changing your event. This
                  device-local PIN is not a security boundary for a managed
                  kiosk.
                </p>
              </div>
            )}
            {(protectedSettings || unlocked) && (
              <>
                <label>
                  Event name
                  <input
                    maxLength={60}
                    value={kiosk.event}
                    onChange={(e) => setKiosk({ event: e.target.value })}
                  />
                </label>
                <label>
                  Event date
                  <input
                    type="date"
                    value={kiosk.date}
                    onChange={(e) => setKiosk({ date: e.target.value })}
                  />
                </label>
                <label>
                  Custom logo (local image, up to 2 MB)
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 2e6) {
                        setMessage("Choose an image under 2 MB.");
                        return;
                      }
                      const r = new FileReader();
                      r.onload = () => {
                        setKiosk({ logo: String(r.result) });
                        setMessage("Logo saved locally.");
                      };
                      r.readAsDataURL(file);
                    }}
                  />
                </label>
                {kiosk.logo && (
                  <button
                    className="text-button"
                    onClick={() => setKiosk({ logo: "" })}
                  >
                    Remove logo
                  </button>
                )}
                <label>
                  Result reset timer
                  <select
                    value={kiosk.reset}
                    onChange={(e) => setKiosk({ reset: +e.target.value })}
                  >
                    {[30, 45, 60, 90, 120].map((n) => (
                      <option key={n} value={n}>
                        {n} seconds
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Capture countdown
                  <select
                    value={settings.countdown}
                    onChange={(e) =>
                      setSettings({ countdown: +e.target.value as 3 | 5 | 10 })
                    }
                  >
                    {[3, 5, 10].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Number of photos
                  <select
                    value={settings.count}
                    onChange={(e) =>
                      setSettings({ count: +e.target.value as 2 | 3 | 4 | 6 })
                    }
                  >
                    {[2, 3, 4, 6].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Print layout
                  <select
                    value={settings.template}
                    onChange={(e) =>
                      setSettings({
                        template: e.target.value as Template,
                      })
                    }
                  >
                    <option value="strip">2 × 6 inch photostrip</option>
                    <option value="postcard">4 × 6 inch postcard</option>
                    <option value="polaroid">4 × 4.8 inch Polaroid</option>
                  </select>
                </label>
              </>
            )}
            <label>
              {protectedSettings ? "Change admin PIN" : "Choose your admin PIN"}
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                autoComplete="new-password"
              />
            </label>
            <button
              className="button secondary full"
              onClick={() => void setPassword()}
            >
              Save PIN
            </button>
            {(protectedSettings || unlocked) && (
              <Link className="button primary full" to="/kiosk">
                Ready for the good times <ArrowRight size={17} />
              </Link>
            )}
          </>
        )}
        {message && (
          <p role="status" className="feedback">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
