import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  Camera,
  UsersRound,
  Sparkles,
  Monitor,
  Heart,
  Globe2,
  LockKeyhole,
  WifiOff,
} from "lucide-react";
function SampleStrip({ variant = 0 }: { variant?: number }) {
  const images =
    variant === 0
      ? ["portrait", "smile", "portrait", "smile"]
      : ["friends", "friends", "friends", "friends"];
  return (
    <div className={`sample-strip sample-${variant}`}>
      <div className="sample-photos">
        {images.map((im, i) => (
          <img
            key={i}
            src={`/images/${im}.jpg`}
            alt={variant ? "Friends sharing a moment" : "Portrait inspiration"}
            style={{
              objectPosition: `${40 + i * 7}% ${25 + i * 15}%`,
              filter: variant
                ? "sepia(.25)"
                : i === 1
                  ? "grayscale(1)"
                  : "none",
              transform: i === 2 ? "scaleX(-1)" : undefined,
            }}
          />
        ))}
      </div>
      <span>
        snappie <span>✳</span>
      </span>
      <small>{variant ? "better together ♡" : "a little moment for me"}</small>
      <small>EST. GOOD MEMORIES</small>
    </div>
  );
}
export function Home() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="live-dot" /> YOUR PEOPLE. YOUR MOMENTS. YOUR LITTLE
            BOOTH.
          </div>
          <h1>
            Little moments.
            <br />
            Forever <span className="serif-italic">memories.</span>
            <svg viewBox="0 0 400 25" aria-hidden="true">
              <path d="M5 14Q190-5 391 10M20 23Q210 4 370 18" />
            </svg>
          </h1>
          <p>
            A few poses, a little laughter, and something to keep.
            <br className="desktop-break" /> Your favorite photobooth, wherever
            life finds you.
          </p>
          <div className="hero-buttons">
            <Link to="/setup" className="button primary">
              Step into the booth <ArrowUpRight size={19} />
            </Link>
            <Link to="/together" className="button secondary">
              <UsersRound size={18} /> Bring someone along
            </Link>
          </div>
          <div className="hero-assurance">
            <span>
              <LockKeyhole size={14} /> No sign-up. Just you.
            </span>
            <i />
            <span>
              <WifiOff size={14} /> Offline friendly
            </span>
          </div>
        </div>
        <div className="hero-art">
          <span className="doodle star-one">✳</span>
          <span className="doodle little-spark">✦</span>
          <div className="orbit" />
          <div className="tape tape-one" />
          <SampleStrip />
          <SampleStrip variant={1} />
          <div className="handwritten">
            a moment worth keeping <span>↗</span>
          </div>
          <div className="memory-label">
            <Heart size={16} fill="currentColor" /> 100% you. 0% perfect poses.
          </div>
          <span className="doodle heart-doodle">♡</span>
        </div>
      </section>
      <div className="marquee" aria-hidden="true">
        <span>GOOD COMPANY</span>
        <span>✳</span>
        <span>HAPPY ACCIDENTS</span>
        <span>✳</span>
        <span>ONE MORE POSE</span>
        <span>✳</span>
        <span>MEMORIES TO KEEP</span>
        <span>✳</span>
        <span>JUST BE YOU</span>
        <span>✳</span>
        <span>GOOD COMPANY</span>
      </div>
      <section className="section modes-section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">THERE’S A BOOTH FOR EVERY MOMENT</div>
            <h2>How are we making memories?</h2>
          </div>
          <span className="handwritten small-note">
            pick your kind of happy ↙
          </span>
        </div>
        <ModeCards />
      </section>
      <section className="how-section section">
        <div className="how-intro">
          <div className="eyebrow">LESS SETUP. MORE SMILING.</div>
          <h2>
            Three little steps.
            <br />
            <span className="serif-italic">One lovely keepsake.</span>
          </h2>
          <Link className="text-link" to="/setup">
            Let’s give it a shot <ArrowRight size={17} />
          </Link>
        </div>
        <div className="steps">
          {[
            [
              "01",
              "Make it yours",
              "Pick a layout, find your light, and bring your favorite people.",
            ],
            [
              "02",
              "Strike a pose",
              "Let the countdown do its thing. Go silly. Go sweet. Go you.",
            ],
            [
              "03",
              "Keep the good stuff",
              "Add your finishing touches, download, and keep it forever.",
            ],
          ].map(([n, t, p]) => (
            <div key={n}>
              <span className="step-number">{n}</span>
              <div>
                <h3>{t}</h3>
                <p>{p}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="privacy-note">
        <div className="privacy-icon">
          <LockKeyhole size={23} />
        </div>
        <div>
          <h3>Your moments belong to you.</h3>
          <p>
            No public gallery. No surprise uploads. Photos stay on your device
            unless you choose to share them.
          </p>
        </div>
        <Link to="/help" className="text-link">
          A little more on privacy <ArrowUpRight size={16} />
        </Link>
      </section>
    </>
  );
}
export function ModeCards() {
  return (
    <div className="mode-cards">
      <Link className="mode-card solo-card" to="/setup">
        <span className="mode-top">
          <span className="mode-icon">
            <Camera />
          </span>
          <span className="pill">JUST YOU. OR YOUR WHOLE CREW.</span>
        </span>
        <div className="mini-art solo-mini">
          <span>✧</span>
          <div className="mini-frame">
            <img src="/images/smile.jpg" alt="Solo photo inspiration" />
            <small>just be you ♡</small>
          </div>
          <span>♡</span>
        </div>
        <h3>
          The little solo booth <ArrowUpRight size={22} />
        </h3>
        <p>
          Solo date? Bestie day? Everyone squeeze in.
          <br />
          Make a little memory, right where you are.
        </p>
        <span className="card-bottom">
          No account needed <span>01 / SOLO & LOCAL</span>
        </span>
      </Link>
      <Link className="mode-card together-card" to="/together">
        <span className="mode-top">
          <span className="mode-icon">
            <UsersRound />
          </span>
          <span className="pill">DIFFERENT PLACES. SAME MOMENT.</span>
        </span>
        <div className="mini-art together-mini">
          <div className="round-photo">
            <img src="/images/portrait.jpg" alt="A person joining virtually" />
          </div>
          <span className="connection-heart">
            ♡<span>· · · · · · · ·</span>
          </span>
          <div className="round-photo">
            <img
              src="/images/smile.jpg"
              alt="Another person joining virtually"
            />
          </div>
          <span className="floating-spark">✦</span>
        </div>
        <h3>
          A little closer, together <ArrowUpRight size={22} />
        </h3>
        <p>
          Miles apart, side by side. Invite your friends
          <br />
          into a private booth and pose together.
        </p>
        <span className="card-bottom">
          Made for up to five <span>02 / ONLINE TOGETHER</span>
        </span>
      </Link>
      <Link className="mode-card event-card" to="/kiosk">
        <span className="mode-top">
          <span className="mode-icon">
            <Monitor />
          </span>
          <span className="pill">BIG DAYS. LITTLE KEEPSAKES.</span>
        </span>
        <div className="mini-art event-mini">
          <div className="event-ticket">
            <Sparkles size={23} />
            <span>
              THE GOOD
              <br />
              TIMES CLUB
            </span>
            <small>YOU’RE ON THE LIST</small>
          </div>
          <span>✺</span>
        </div>
        <h3>
          For the good times <ArrowUpRight size={22} />
        </h3>
        <p>
          Weddings, parties, and just-because days.
          <br />A ready-to-party booth for your event.
        </p>
        <span className="card-bottom">
          Touch-friendly & print-ready <span>03 / EVENT KIOSK</span>
        </span>
      </Link>
    </div>
  );
}
export function Modes() {
  return (
    <section className="section page">
      <div className="page-title">
        <span className="eyebrow">COME ON IN</span>
        <h1>Your moment starts here.</h1>
        <p>One little booth. Three ways to make it yours.</p>
      </div>
      <ModeCards />
      <div className="inline-facts">
        <span>
          <Globe2 size={16} /> Anywhere you are
        </span>
        <span>
          <LockKeyhole size={16} /> Private by default
        </span>
        <span>
          <Heart size={16} /> Made to keep
        </span>
      </div>
    </section>
  );
}
