import { Link } from "react-router-dom";
import { ShieldCheck, WifiOff, Camera, UsersRound } from "lucide-react";
export function Help() {
  return (
    <section className="page help-page narrow">
      <div className="page-title">
        <span className="eyebrow">A LITTLE PEACE OF MIND</span>
        <h1>Your moments. Your business.</h1>
        <p>A few things to know before you strike a pose.</p>
      </div>
      <div className="help-grid">
        {[
          [
            ShieldCheck,
            "Private, by default",
            "Solo and kiosk photos are processed on your device. There is no public gallery, automatic recording, analytics, or cloud photo upload. Outside kiosk mode, saving a draft is optional and stores it in this browser. Delete it in the editor or clear site data.",
          ],
          [
            UsersRound,
            "A booth just for two",
            "Online rooms use Supabase for anonymous identity, room membership, presence, and connection messages. Photos and live media travel over encrypted WebRTC connections, potentially relayed by a TURN server. Your invited partner receives your captures and can save them. Keep invitation links private. Rooms expire after inactivity or when the host closes them.",
          ],
          [
            Camera,
            "Let’s get your camera ready",
            "Camera access needs HTTPS or localhost. Allow permission using the browser’s address-bar controls. If the camera is busy, close video calls and other camera apps. Microphone permission is requested separately in online rooms; it’s never required for local photos.",
          ],
          [
            WifiOff,
            "Your little offline escape",
            "After the app finishes caching, solo capture, editing, downloads, and kiosk mode work offline. Use your browser’s Install app or Add to Home Screen option for easy access. Wait for “Ready for offline memories” in the footer before disconnecting. Online Together requires internet. Browser storage can be cleared or evicted; export photos you want to keep.",
          ],
        ].map(([Icon, title, body]) => {
          const I = Icon as typeof Camera;
          return (
            <article className="panel" key={String(title)}>
              <I size={25} />
              <h2>{String(title)}</h2>
              <p>{String(body)}</p>
            </article>
          );
        })}
      </div>
      <div className="panel">
        <h2>Print a little piece of happiness.</h2>
        <p>
          Classic strips export at 600 × 1800 pixels for 2 × 6 inches. Postcards
          export at 1800 × 1200 pixels for 6 × 4 inches, both at 300 pixels per
          inch. Match your paper size and select 100% scale. Printing always
          opens the browser and operating system print dialog. A dedicated
          silent-print bridge is a future integration.
        </p>
        <h2>Long-distance timing</h2>
        <p>
          Shared countdowns estimate the difference between device clocks over
          the data channel. Internet latency and device performance vary, so
          captures are approximately synchronized. Both images must arrive
          before a paired shot is composed.
        </p>
        <Link to="/setup" className="text-link">
          Ready to make a memory? →
        </Link>
      </div>
    </section>
  );
}
