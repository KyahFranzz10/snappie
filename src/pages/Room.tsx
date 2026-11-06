import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Camera,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Copy,
  Check,
  UsersRound,
  ArrowRight,
  X,
  RefreshCw,
  LayoutTemplate,
} from "lucide-react";
import { anonymousSession, rpc } from "../services/supabase/client";
import {
  BoothPeer,
  type RoomInfo,
  type RoomMember,
  type RoomState,
} from "../services/webrtc/peer";
import { useCamera } from "../features/camera/useCamera";
import { useBooth } from "../stores/booth";
import { pairPhotos } from "../features/photostrip/compose";
import { useOnline } from "../hooks/useOnline";
interface RoomDetail extends RoomInfo {
  members: RoomMember[];
}
interface Shot {
  local?: string;
  remote?: string;
  resolve?: (data: string) => void;
  reject?: (e: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
  layout: "side" | "stack";
  composing?: boolean;
}
export function Room() {
  const { id } = useParams();
  const navigate = useNavigate();
  const online = useOnline();
  const camera = useCamera({ width: 1920, height: 1080 });
  // Keep peer transfers bounded and JPEG-compatible while local sessions retain PNG originals.
  const captureRef = useRef(() =>
    camera.capture({ format: "jpeg", maxDimension: 1920 }),
  );
  captureRef.current = () =>
    camera.capture({ format: "jpeg", maxDimension: 1920 });
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const peer = useRef<BoothPeer | null>(null);
  const connecting = useRef(false);
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [uid, setUid] = useState("");
  const [state, setState] = useState<RoomState>("waiting");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [mic, setMic] = useState(false);
  const [micGranted, setMicGranted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [ready, setReady] = useState(false);
  const [partnerReady, setPartnerReady] = useState(false);
  const [present, setPresent] = useState<string[]>([]);
  const [layout, setLayout] = useState<"side" | "stack">("side");
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const readyRef = useRef(false);
  const [count, setCount] = useState<number | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [expectedPhotos, setExpectedPhotos] = useState(4);
  const shots = useRef(new Map<string, Shot>());
  const completed = useRef<string[]>([]);
  const sequence = useRef(false);
  const alive = useRef(true);
  const timers = useRef(
    new Map<ReturnType<typeof setTimeout>, (e: Error) => void>(),
  );
  const isHost = room?.host_id === uid;
  const hostRef = useRef(isHost);
  hostRef.current = isHost;
  const booth = useBooth();
  const clearShots = useCallback(() => {
    for (const s of shots.current.values()) {
      if (s.timer) clearTimeout(s.timer);
      s.reject?.(new Error("Session stopped."));
    }
    shots.current.clear();
    for (const [t, reject] of timers.current) {
      clearTimeout(t);
      reject(new Error("Session stopped. Reconnect and try again."));
    }
    timers.current.clear();
    setCount(null);
  }, []);
  const failure = useCallback(
    (e: Error) => {
      if (alive.current) {
        setError(e.message);
        setReady(false);
        readyRef.current = false;
        setPartnerReady(false);
        sequence.current = false;
        setState("disconnected");
        clearShots();
      }
    },
    [clearShots],
  );
  useEffect(() => {
    alive.current = true;
    let active = true;
    void anonymousSession()
      .then(async (s) => {
        const detail = await rpc<RoomDetail>("room_status", { p_id: id });
        if (active) {
          setUid(s.user.id);
          setRoom(detail);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      alive.current = false;
      peer.current?.dispose();
      peer.current = null;
      clearShots();
    };
  }, [id, clearShots]);
  useEffect(() => {
    if (!room) return;
    let active = true;
    const tick = async () => {
      try {
        const r = await rpc<RoomDetail>("heartbeat_room", { p_id: id });
        if (active) {
          setRoom(r);
          if (r.closed || new Date(r.expires_at).getTime() < Date.now()) {
            setState("expired");
            setError(
              "This room has closed or expired. Create a fresh little booth.",
            );
            peer.current?.dispose();
            camera.stop();
          }
        }
      } catch (e) {
        if (active) {
          setState("expired");
          setError(e instanceof Error ? e.message : "Room expired.");
          peer.current?.dispose();
          camera.stop();
        }
      }
    };
    const timer = setInterval(() => void tick(), 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [room?.id, id, camera.stop]);
  useEffect(() => {
    if (!online && peer.current)
      failure(
        new Error(
          "You’re offline. Reconnect to the internet, then both retry the connection.",
        ),
      );
  }, [online, failure]);
  function delay(ms: number) {
    return new Promise<void>((resolve, reject) => {
      const t = setTimeout(
        () => {
          timers.current.delete(t);
          if (!alive.current) reject(new Error("Room left."));
          else resolve();
        },
        Math.max(0, ms),
      );
      timers.current.set(t, reject);
    });
  }
  async function combine(shotId: string) {
    const shot = shots.current.get(shotId);
    if (!shot?.local || !shot.remote || shot.composing) return;
    shot.composing = true;
    try {
      const result = await pairPhotos(
        hostRef.current ? shot.local : shot.remote,
        hostRef.current ? shot.remote : shot.local,
        shot.layout,
      );
      if (!alive.current || shots.current.get(shotId) !== shot) return;
      if (shot.timer) clearTimeout(shot.timer);
      shot.resolve?.(result);
      shots.current.delete(shotId);
      completed.current.push(result);
      setPhotos([...completed.current]);
    } catch (e) {
      shot.reject?.(
        e instanceof Error ? e : new Error("Could not combine photos."),
      );
      failure(
        new Error(
          "Could not combine a paired photo. Retry the shared session.",
        ),
      );
    }
  }
  async function take(
    shotId: string,
    at: number,
    shotLayout: "side" | "stack",
  ) {
    if (!peer.current?.open) throw new Error("Your partner is disconnected.");
    const existing = shots.current.get(shotId);
    if (existing?.local) return;
    const shot: Shot = existing || { layout: shotLayout };
    shots.current.set(shotId, shot);
    if (!shot.timer)
      shot.timer = setTimeout(
        () =>
          failure(
            new Error(
              "Your partner’s photo did not arrive. Both participants should reconnect and retry.",
            ),
          ),
        45000,
      );
    setState("capturing");
    while (Date.now() < at) {
      if (!alive.current || !peer.current?.open)
        throw new Error("Connection lost during countdown.");
      setCount(Math.max(1, Math.ceil((at - Date.now()) / 1000)));
      await delay(Math.min(100, Math.max(0, at - Date.now())));
    }
    setCount(null);
    shot.local = captureRef.current();
    setState("processing");
    await combine(shotId);
    await peer.current.sendPhoto(shotId, shot.local);
  }
  async function connect() {
    if (
      !room ||
      !uid ||
      !camera.stream ||
      !camera.ready ||
      !online ||
      connecting.current
    )
      return;
    connecting.current = true;
    const previous = peer.current;
    setError("");
    clearShots();
    setReady(false);
    readyRef.current = false;
    setPartnerReady(false);
    setMic(false);
    setMicGranted(false);
    setState("connecting");
    try {
      if (previous) {
        await previous.dispose();
        if (!alive.current || peer.current !== previous) return;
      }
      const p = new BoothPeer(
        room,
        uid,
        room.members.find((m) => m.user_id !== uid)?.user_id || null,
        camera.stream,
        {
          state: (s) => {
            if (alive.current) {
              setState(s);
              if (s === "disconnected") {
                setReady(false);
                readyRef.current = false;
                setPartnerReady(false);
              }
            }
          },
          remote: (s) => {
            if (remoteVideo.current) {
              remoteVideo.current.srcObject = s;
              void remoteVideo.current.play().catch(() => {});
            }
          },
          presence: setPresent,
          error: failure,
          photo: (shotId, data) => {
            if (!shots.current.has(shotId)) return;
            shots.current.get(shotId)!.remote = data;
            void combine(shotId);
          },
          message: (m) => {
            if (m.type === "ready") {
              setPartnerReady(m.value === true);
            }
            if (m.type === "reset" && !hostRef.current) {
              clearShots();
              completed.current = [];
              setPhotos([]);
              setSessionComplete(false);
              setExpectedPhotos(
                [2, 3, 4, 6].includes(Number(m.count)) ? Number(m.count) : 4,
              );
              sequence.current = false;
            }
            if (m.type === "schedule" && !hostRef.current) {
              if (
                !readyRef.current ||
                typeof m.id !== "string" ||
                typeof m.at !== "number" ||
                Math.abs(Number(m.at) - p.remoteOffset - Date.now()) > 20000
              ) {
                failure(
                  new Error(
                    "Shared timing was invalid or the camera was not ready.",
                  ),
                );
                return;
              }
              sequence.current = true;
              void take(
                m.id,
                Number(m.at) - p.remoteOffset,
                m.layout === "stack" ? "stack" : "side",
              ).catch((e) => failure(e));
            }
            if (m.type === "complete" && !hostRef.current) {
              sequence.current = false;
              setSessionComplete(true);
              setState("completed");
            }
            if (m.type === "closed") {
              setState("expired");
              setError("Your host closed this room.");
              peer.current?.dispose();
              camera.stop();
            }
          },
        },
      );
      peer.current = p;
      await p.connect();
    } catch (e) {
      failure(e instanceof Error ? e : new Error("Connection failed."));
    } finally {
      connecting.current = false;
    }
  }
  const autoConnect = useEffectEvent(() => {
    if (!peer.current) void connect();
  });
  useEffect(() => {
    if (room?.id === id && uid && camera.ready && online) autoConnect();
  }, [room?.id, id, uid, camera.ready, online]);

  useEffect(() => {
    if (camera.ready || !readyRef.current) return;
    readyRef.current = false;
    setReady(false);
    if (peer.current?.open) {
      try {
        peer.current.send({ type: "ready", value: false });
      } catch {
        // A closed data channel resets readiness on both sides.
      }
    }
  }, [camera.ready]);
  function markReady() {
    try {
      if (!cameraOn || !camera.ready)
        throw new Error("Turn your camera on first.");
      if (!peer.current?.open)
        throw new Error("Connect with your partner first.");
      peer.current.send({ type: "ready", value: !ready });
      setReady(!ready);
      readyRef.current = !ready;
      if (!ready) setState("ready");
      else setState("connected");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not mark ready.");
    }
  }
  async function start() {
    if (
      sequence.current ||
      !isHost ||
      !ready ||
      !camera.ready ||
      !partnerReady ||
      !peer.current?.open
    )
      return;
    sequence.current = true;
    setError("");
    clearShots();
    completed.current = [];
    setPhotos([]);
    setSessionComplete(false);
    setExpectedPhotos(booth.settings.count);
    try {
      peer.current.send({ type: "reset", count: booth.settings.count });
      for (let i = 0; i < booth.settings.count; i++) {
        if (!sequence.current) throw new Error("Capture stopped.");
        const shotId = crypto.randomUUID(),
          at =
            Date.now() +
            booth.settings.countdown * 1000 +
            Math.max(300, peer.current.latency * 2);
        const paired = new Promise<string>((resolve, reject) => {
          const timer = setTimeout(
            () =>
              reject(
                new Error(
                  "Waiting for the other camera timed out. Reconnect and retry.",
                ),
              ),
            45000,
          );
          shots.current.set(shotId, {
            resolve,
            reject,
            timer,
            layout: layoutRef.current,
          });
        });
        void paired.catch(() => {});
        peer.current.send({
          type: "schedule",
          id: shotId,
          at,
          layout: layoutRef.current,
        });
        await take(shotId, at, layoutRef.current);
        await paired;
      }
      peer.current.send({ type: "complete" });
      setSessionComplete(true);
      setState("completed");
    } catch (e) {
      failure(e instanceof Error ? e : new Error("Shared capture failed."));
    } finally {
      sequence.current = false;
      setCount(null);
    }
  }
  async function close() {
    try {
      await peer.current?.closeRoom();
      await rpc("close_room", { p_id: id });
      peer.current?.dispose();
      camera.stop();
      navigate("/together");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not close this room.");
    }
  }
  const invitation = `${location.origin}/join/${id}${location.hash}`;
  const connected = !!peer.current?.open;
  const working = state === "capturing" || state === "processing";
  return (
    <section className="page room-page">
      <div className="capture-heading">
        <div>
          <span className="eyebrow">A PRIVATE LITTLE ROOM FOR TWO</span>
          <h1>{room?.name || "Opening your little booth…"}</h1>
        </div>
        <span
          className={`connection-status ${connected ? "connected" : ""}`}
          role="status"
        >
          <span className="live-dot" />
          {state}
        </span>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {!room && (
        <Link className="button secondary" to="/together">
          Back to room setup
        </Link>
      )}
      {room && (
        <>
          <div className="room-invitation">
            <span>
              <UsersRound size={18} /> {present.length || 1}/2 in the booth
            </span>
            <input
              readOnly
              aria-label="Private invitation link"
              value={invitation}
            />
            <button
              className="button secondary small"
              onClick={() =>
                void navigator.clipboard
                  .writeText(invitation)
                  .then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  })
                  .catch(() =>
                    setError("Copy the invitation from the link field."),
                  )
              }
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}{" "}
              {copied ? "Copied" : "Copy invite"}
            </button>
          </div>
          <div className={`room-cameras ${layout}`}>
            <div className="room-video camera-stage">
              <video
                className="mirrored"
                ref={camera.video}
                autoPlay
                muted
                playsInline
              />
              {!camera.stream && (
                <div className="camera-empty">
                  <Camera size={36} />
                  <h3>Your side of the booth</h3>
                  <button
                    className="button primary"
                    disabled={camera.busy || state === "expired"}
                    onClick={() => void camera.start()}
                  >
                    Enable camera
                  </button>
                </div>
              )}
              <span className="camera-caption">
                {room.members.find((m) => m.user_id === uid)?.nickname || "You"}{" "}
                {isHost ? "· host" : ""}
              </span>
            </div>
            <div className="room-video camera-stage">
              <video ref={remoteVideo} autoPlay playsInline />
              {!connected && (
                <div className="camera-empty">
                  <UsersRound size={38} />
                  <h3>
                    {state === "connecting"
                      ? "Finding your person…"
                      : "A little space for your person"}
                  </h3>
                  <p>
                    Both people need to open the room and enable their cameras.
                  </p>
                </div>
              )}
              <span className="camera-caption">
                {room.members.find((m) => m.user_id !== uid)?.nickname ||
                  "Your person"}{" "}
                {partnerReady ? "· ready" : "· getting ready"}
              </span>
            </div>
            {count !== null && (
              <div
                className="countdown-overlay"
                role="status"
                aria-live="assertive"
              >
                <span>{count}</span>
                <p>A shared little moment</p>
              </div>
            )}
          </div>
          {camera.error && (
            <p className="error" role="alert">
              {camera.error}
            </p>
          )}
          <div className="room-controls">
            <button
              className="button secondary small"
              disabled={
                !camera.ready ||
                !online ||
                working ||
                state === "connecting" ||
                state === "expired"
              }
              onClick={() => void connect()}
            >
              <RefreshCw size={16} />
              {connected ? "Reconnect" : "Connect with your person"}
            </button>
            <button
              className="icon-button"
              aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}
              disabled={!camera.stream || working}
              onClick={() => {
                camera.stream
                  ?.getVideoTracks()
                  .forEach((t) => (t.enabled = !cameraOn));
                setCameraOn(!cameraOn);
                setReady(false);
                readyRef.current = false;
                try {
                  peer.current?.send({ type: "ready", value: false });
                } catch {
                  /* Reconnect is shown in controls. */
                }
              }}
            >
              {cameraOn ? <Video size={20} /> : <VideoOff size={20} />}
            </button>
            <button
              className="icon-button"
              disabled={!connected || working}
              aria-label={mic ? "Mute microphone" : "Enable microphone"}
              onClick={() =>
                void (async () => {
                  try {
                    if (!micGranted) {
                      await peer.current?.microphone();
                      setMicGranted(true);
                    }
                    peer.current?.mute(mic);
                    setMic(!mic);
                  } catch {
                    setError(
                      "Microphone permission was declined or the device is unavailable. You can still take photos together.",
                    );
                  }
                })()
              }
            >
              {mic ? <Mic size={20} /> : <MicOff size={20} />}
            </button>
            <button
              className="icon-button"
              disabled={working}
              aria-label="Switch camera layout"
              onClick={() => setLayout(layout === "side" ? "stack" : "side")}
            >
              <LayoutTemplate size={20} />
            </button>
            <div className="grow" />
            <button
              className={`button ${ready ? "secondary" : "primary"} small`}
              disabled={!connected || working || !cameraOn || !camera.ready}
              aria-pressed={ready}
              onClick={markReady}
            >
              <Check size={17} />
              {ready ? "You’re ready" : "I’m ready"}
            </button>
            {isHost && (
              <button
                className="button primary small"
                disabled={
                  !ready ||
                  !partnerReady ||
                  !connected ||
                  !camera.ready ||
                  working
                }
                onClick={() => void start()}
              >
                <Camera size={17} /> Start shared countdown
              </button>
            )}
          </div>
          <p className="small muted centered">
            {!camera.ready
              ? "Enable your camera to connect."
              : !connected
                ? "Waiting for both cameras to connect. If testing on one computer, use a separate browser profile for your guest."
                : !ready
                  ? "Press I’m ready when you’re in position."
                  : !partnerReady
                    ? "Waiting for your partner to press I’m ready."
                    : "Both people are ready. The host can start the shared countdown."}
          </p>
          {isHost && (
            <div className="room-capture-settings">
              <label>
                Shots
                <select
                  disabled={working}
                  value={booth.settings.count}
                  onChange={(e) =>
                    booth.setSettings({
                      count: +e.target.value as 2 | 3 | 4 | 6,
                    })
                  }
                >
                  {[2, 3, 4, 6].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label>
                Countdown
                <select
                  disabled={working}
                  value={booth.settings.countdown}
                  onChange={(e) =>
                    booth.setSettings({
                      countdown: +e.target.value as 3 | 5 | 10,
                    })
                  }
                >
                  {[3, 5, 10].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {photos.length > 0 && (
            <div className="room-results">
              <h3>{photos.length} moments, made together.</h3>
              <div>
                {photos.map((p, i) => (
                  <img src={p} alt={`Together moment ${i + 1}`} key={i} />
                ))}
              </div>
              {sessionComplete && photos.length === expectedPhotos && (
                <button
                  className="button primary"
                  onClick={() => {
                    booth.reset();
                    booth.setMode("together");
                    booth.setPhotos(photos);
                    booth.setEditor({ caption: room.name });
                    peer.current?.dispose();
                    camera.stop();
                    navigate("/editor");
                  }}
                >
                  Make our keepsake <ArrowRight size={18} />
                </button>
              )}
            </div>
          )}
          <div className="room-bottom">
            {isHost ? (
              <button className="text-button" onClick={() => void close()}>
                <X size={16} /> Close private room
              </button>
            ) : (
              <Link className="text-link" to="/together">
                Leave room →
              </Link>
            )}
            <span className="small muted">
              Invite-only · Photos sent directly to your partner · No cloud
              photo storage
            </span>
          </div>
        </>
      )}
    </section>
  );
}
