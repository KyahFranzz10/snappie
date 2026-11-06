import { Link, NavLink, Outlet } from "react-router-dom";
import {
  Camera,
  Moon,
  Sun,
  ArrowUpRight,
  WifiOff,
  Download,
  Heart,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useOffline } from "../hooks/useOffline";
import { useOnline } from "../hooks/useOnline";
import { useKioskIdle } from "../hooks/useKioskIdle";
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
export function Layout() {
  useKioskIdle();
  const online = useOnline();
  const [dark, setDark] = useState(
    localStorage.getItem("snapbooth-theme") === "dark",
  );
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const { ready, refresh, update } = useOffline();
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("snapbooth-theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    const f = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    const done = () => {
      setInstall(null);
      setInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", f);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("beforeinstallprompt", f);
      window.removeEventListener("appinstalled", done);
    };
  }, []);
  return (
    <>
      <header className="header">
        <Link to="/" className="brand">
          <span className="brand-mark">
            <Camera size={23} />
          </span>
          snappie<span className="brand-dot">✳</span>
        </Link>
        <nav aria-label="Main navigation">
          <NavLink to="/modes">The photobooth</NavLink>
          <NavLink to="/together">
            Online together <span className="tiny-badge">UP TO FIVE</span>
          </NavLink>
          <NavLink to="/kiosk">For events</NavLink>
        </nav>
        <div className="header-actions">
          <button
            className="icon-button"
            aria-label={dark ? "Use light theme" : "Use dark theme"}
            onClick={() => setDark(!dark)}
          >
            {dark ? <Sun size={19} /> : <Moon size={19} />}
          </button>
          <Link className="button small primary" to="/setup">
            Let’s make memories <ArrowUpRight size={16} />
          </Link>
        </div>
      </header>
      {!online && (
        <div className="notice">
          <WifiOff size={16} /> You’re offline. Your solo and event booths are
          still here.
        </div>
      )}
      {refresh && (
        <div className="notice">
          A fresh Snappie is ready. Finish your session first.
          <button onClick={() => update()}>Update app</button>
        </div>
      )}
      <main>
        <Outlet />
      </main>
      <footer className="footer">
        <Link className="brand" to="/">
          snappie ✳
        </Link>
        <span>
          Made for the moments in between. <Heart size={12} />
        </span>
        <div>
          {install ? (
            <button
              className="text-button"
              onClick={() => void install.prompt()}
            >
              <Download size={14} /> Install app
            </button>
          ) : (
            <span className="cache-status">
              {installed
                ? "App installed"
                : ready
                  ? "Ready for offline memories"
                  : "Your little booth, anywhere"}
            </span>
          )}
          <Link to="/help">Privacy & help</Link>
        </div>
      </footer>
    </>
  );
}
