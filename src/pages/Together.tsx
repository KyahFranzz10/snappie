import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  UsersRound,
  ArrowRight,
  LockKeyhole,
  Copy,
  Check,
  WifiOff,
} from "lucide-react";
import {
  anonymousSession,
  configured,
  roomSecret,
  rpc,
  supabase,
  turnstileSiteKey,
} from "../services/supabase/client";
import { useOnline } from "../hooks/useOnline";
import { SignupChallenge } from "../components/SignupChallenge";
export function Together({ join = false }: { join?: boolean }) {
  const online = useOnline();
  const { id } = useParams();
  const navigate = useNavigate();
  const [nickname, setNickname] = useState("");
  const [name, setName] = useState("A little moment together");
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [challengeAttempt, setChallengeAttempt] = useState(0);
  const [preview, setPreview] = useState<{
    name: string;
    locked: boolean;
  } | null>(null);
  const [invitation, setInvitation] = useState("");
  const [copied, setCopied] = useState(false);
  const secret = new URLSearchParams(location.hash.slice(1)).get("key") || "";
  const challengeSiteKey = verified ? undefined : turnstileSiteKey;
  useEffect(() => {
    if (!turnstileSiteKey || !supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) setVerified(true);
    });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!join || !id || !configured || !online || challengeSiteKey) return;
    let active = true;
    void anonymousSession()
      .then(() =>
        rpc<{ name: string; locked: boolean }>("preview_room", {
          p_id: id,
          p_secret: secret,
        }),
      )
      .then((p) => {
        if (active) setPreview(p);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [join, id, secret, online, challengeSiteKey]);
  async function verify() {
    setBusy(true);
    setError("");
    try {
      await anonymousSession(captchaToken);
      setVerified(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed.");
      setChallengeAttempt((attempt) => attempt + 1);
    } finally {
      setCaptchaToken("");
      setBusy(false);
    }
  }
  async function submit() {
    if (!online || !configured) return;
    setBusy(true);
    setError("");
    try {
      await anonymousSession();
      if (join) {
        if (!id) throw new Error("Invalid invitation.");
        const rejection = await rpc<string | null>("join_room", {
          p_id: id,
          p_secret: secret,
          p_passcode: passcode,
          p_nickname: nickname.trim(),
        });
        if (rejection) throw new Error(rejection);
        navigate(`/room/${id}#key=${secret}`);
      } else {
        const key = roomSecret();
        const room = await rpc<string>("create_room", {
          p_name: name.trim(),
          p_nickname: nickname.trim(),
          p_secret: key,
          p_passcode: passcode,
        });
        navigate(`/room/${room}#key=${key}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the room.");
    } finally {
      setBusy(false);
    }
  }
  function openInvitation() {
    try {
      const url = new URL(invitation);
      if (
        url.origin !== location.origin ||
        !/^\/join\/[0-9a-f-]+$/.test(url.pathname)
      )
        throw new Error();
      navigate(url.pathname + url.hash);
    } catch {
      setError("Paste a complete Snappie invitation link from this website.");
    }
  }
  return (
    <section className="page narrow">
      <Link to="/modes" className="back-link">
        ← All booths
      </Link>
      <div className="page-title">
        <span className="eyebrow">DIFFERENT PLACES. SAME MOMENT.</span>
        <h1>
          {join ? "Your person is waiting." : "A little closer, together."}
        </h1>
        <p>
          {join
            ? "One link. Two people. A memory you both get to keep."
            : "A private photobooth for you and your favorite faraway person."}
        </p>
      </div>
      <div className="together-grid">
        <div className="panel room-form">
          <div className="room-form-icon">
            <UsersRound size={29} />
          </div>
          <h2>
            {join
              ? preview?.name || "Join a private booth"
              : "Make a little room for two"}
          </h2>
          {!configured && (
            <div className="notice-block">
              <strong>The online booth needs a connection setup.</strong>
              <p>
                Add your Supabase URL and public anon key to .env.local, apply
                the included SQL migration, and enable anonymous sign-in. Then
                restart the app. Solo and event modes work without this setup.
              </p>
              <Link to="/setup" className="text-link">
                Try the solo booth →
              </Link>
            </div>
          )}
          {!online && (
            <div className="error">
              <WifiOff size={18} /> You’re offline. Online rooms need an
              internet connection.
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (challengeSiteKey) {
                if (captchaToken && !busy && online) void verify();
              } else {
                void submit();
              }
            }}
          >
            {challengeSiteKey && configured && (
              <SignupChallenge
                key={challengeAttempt}
                siteKey={challengeSiteKey}
                onToken={setCaptchaToken}
              />
            )}
            {!join && (
              <label>
                Give your room a name
                <input
                  required
                  maxLength={60}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            )}
            <label>
              What should we call you?
              <input
                placeholder="Your nickname"
                required
                maxLength={24}
                autoComplete="nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
              />
            </label>
            {(!join || preview?.locked) && (
              <label>
                {join ? "Room passcode" : "A little extra privacy (optional)"}
                <input
                  type="password"
                  maxLength={64}
                  autoComplete="off"
                  required={join && preview?.locked}
                  placeholder={
                    join
                      ? "Ask your host for the passcode"
                      : "Add a room passcode"
                  }
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                />
              </label>
            )}
            <button
              className="button primary full"
              formNoValidate={!!challengeSiteKey}
              disabled={
                busy ||
                !online ||
                !configured ||
                (challengeSiteKey ? !captchaToken : join && !preview)
              }
            >
              {busy
                ? "Opening your booth…"
                : challengeSiteKey
                  ? "Verify to continue"
                  : join
                    ? "Join the booth"
                    : "Create a private room"}{" "}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="small muted">
            <LockKeyhole size={13} /> Invite-only. Two people. No automatic
            uploads.
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
        <aside className="together-aside">
          <div className="long-distance-art">
            <div>
              <img src="/images/portrait.jpg" alt="Portrait inspiration" />
              <span>you</span>
            </div>
            <span>♡</span>
            <div>
              <img src="/images/smile.jpg" alt="Portrait inspiration" />
              <span>your person</span>
            </div>
          </div>
          <h3>
            Same silly pose.
            <br />
            Different time zones.
          </h3>
          <p>
            See each other live, share a countdown, and create one keepsake from
            both cameras.
          </p>
          <p className="small muted">
            Camera permission comes next. Microphone access is always a separate
            choice.
          </p>
          {!join && (
            <div className="join-link-form">
              <label>
                Already have an invitation?
                <input
                  type="url"
                  placeholder="Paste your invitation link"
                  value={invitation}
                  onChange={(e) => setInvitation(e.target.value)}
                />
              </label>
              <button
                disabled={!invitation}
                className="button secondary full"
                onClick={openInvitation}
              >
                Open invitation <ArrowRight size={16} />
              </button>
              <button
                className="text-button"
                onClick={() => {
                  void navigator.clipboard
                    ?.readText()
                    .then((t) => {
                      setInvitation(t);
                      setCopied(true);
                    })
                    .catch(() =>
                      setError(
                        "Paste your invitation manually in the field above.",
                      ),
                    );
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />} Paste from
                clipboard
              </button>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
