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
import {
  composeGroup,
  groupLayoutName,
  groupLayouts,
  groupTiles,
  type GroupLayout,
} from "../features/photostrip/group";
import { useOnline } from "../hooks/useOnline";
interface RoomDetail extends RoomInfo {
  members: RoomMember[];
}

interface Run {
  id: string;
  guests: string[];
}
interface Shot {
  photos: Map<string, string>;
  resolve?: () => void;
  timer: ReturnType<typeof setTimeout>;
}
function RemoteCamera({ stream }: { stream?: MediaStream }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (video.current) video.current.srcObject = stream ?? null;
  }, [stream]);
  return <video ref={video} autoPlay playsInline />;
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

  const [remoteReady, setRemoteReady] = useState<Record<string, boolean>>({});
  const [streams, setStreams] = useState<
    Record<string, MediaStream | undefined>
  >({});
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [present, setPresent] = useState<string[]>([]);
  const [layout, setLayout] = useState<GroupLayout>("equal");
  const [spotlight, setSpotlight] = useState("");
  const [previewStack, setPreviewStack] = useState(false);
  const activeLayout = groupLayouts[layout].sizes.includes(present.length)
    ? layout
    : "equal";
  const [working, setWorking] = useState(false);
  const readyRef = useRef(false);
  const [count, setCount] = useState<number | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [expectedPhotos, setExpectedPhotos] = useState(4);
  const shots = useRef(new Map<string, Shot>());
  const completed = useRef<string[]>([]);
  const sequence = useRef<Run | null>(null);
  const alive = useRef(true);
  const timers = useRef(
    new Map<ReturnType<typeof setTimeout>, (e: Error) => void>(),
  );
  const isHost = room?.host_id === uid;
  const booth = useBooth();

  const clearShots = useCallback(() => {
    sequence.current = null;
    for (const shot of shots.current.values()) {
      clearTimeout(shot.timer);
      shot.resolve?.();
    }
    shots.current.clear();
    for (const [timer, reject] of timers.current) {
      clearTimeout(timer);
      reject(new Error("Capture stopped."));
    }
    timers.current.clear();
    setWorking(false);
    setCount(null);
  }, []);
  const failure = useCallback(
    (e: Error) => {
      if (!alive.current) return;
      const run = sequence.current;
      clearShots();
      setError(e.message);
      setState("disconnected");
      if (run && peer.current) {
        for (const guest of run.guests) {
          try {
            peer.current.send([guest], { type: "abort", run: run.id });
          } catch {
            // The other cameras detect a closed link independently.
          }
        }
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
            clearShots();
            peer.current?.dispose();
            camera.stop();
          }
        }
      } catch (e) {
        if (active) {
          setState("expired");
          setError(e instanceof Error ? e.message : "Room expired.");
          clearShots();
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
          "You’re offline. Reconnect to the internet, then reconnect the booth.",
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

  function appendPhoto(photo: string) {
    completed.current.push(photo);
    setPhotos([...completed.current]);
  }

  async function capture(at: number, run: Run) {
    setState("capturing");
    while (Date.now() < at) {
      if (sequence.current !== run) throw new Error("Capture stopped.");
      setCount(Math.max(1, Math.ceil((at - Date.now()) / 1000)));
      await delay(Math.min(100, Math.max(0, at - Date.now())));
    }
    if (sequence.current !== run) throw new Error("Capture stopped.");
    setCount(null);
    setState("processing");
    return captureRef.current();
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
    setRemoteReady({});
    setOpenIds([]);
    setStreams({});
    setMic(false);
    setMicGranted(false);
    setState("connecting");
    try {
      if (previous) {
        await previous.dispose();
        if (!alive.current || peer.current !== previous) return;
      }
      const host = room.host_id;
      const p = new BoothPeer(room, uid, camera.stream, {
        state: (state) => {
          if (alive.current && !sequence.current) setState(state);
        },
        presence: (ids) => {
          setPresent(ids);
          void rpc<RoomDetail>("room_status", { p_id: room.id })
            .then((detail) => {
              if (peer.current === p && alive.current) setRoom(detail);
            })
            .catch(() => {});
        },
        connection: (member, open) => {
          setOpenIds((ids) =>
            open
              ? [...new Set([...ids, member])]
              : ids.filter((id) => id !== member),
          );
          if (open) {
            if (readyRef.current)
              p.send([member], { type: "ready", value: true });
            return;
          }
          setRemoteReady((ready) => ({ ...ready, [member]: false }));
          if (sequence.current?.guests.includes(member))
            failure(
              new Error(
                "A camera left during capture. Reconnect and start again.",
              ),
            );
        },
        remote: (member, stream) =>
          setStreams((current) => {
            const next = { ...current };
            if (stream) next[member] = stream;
            else delete next[member];
            return next;
          }),
        error: failure,
        photo: (member, shotId, data) => {
          const shot = shots.current.get(shotId);
          const run = sequence.current;
          if (!shot || !run || !run.guests.includes(member)) return;
          if (uid === host) {
            shot.photos.set(member, data);
            if (run.guests.every((guest) => shot.photos.has(guest)))
              shot.resolve?.();
          } else {
            clearTimeout(shot.timer);
            shots.current.delete(shotId);
            appendPhoto(data);
          }
        },
        message: (member, message) => {
          if (message.type === "ready") {
            setRemoteReady((ready) => ({
              ...ready,
              [member]: message.value === true,
            }));
            return;
          }
          if (message.type === "closed" && member === host) {
            clearShots();
            setState("expired");
            setError("Your host closed this room.");
            p.dispose();
            camera.stop();
            return;
          }
          if (
            message.type === "abort" &&
            sequence.current?.id === message.run &&
            sequence.current?.guests.includes(member)
          ) {
            failure(
              new Error(
                "The shared capture stopped. Start again when everyone is ready.",
              ),
            );
            return;
          }
          if (uid === host || member !== host) return;
          if (
            message.type === "reset" &&
            typeof message.run === "string" &&
            readyRef.current
          ) {
            clearShots();
            sequence.current = { id: message.run, guests: [host] };
            setWorking(true);
            setState("capturing");
            completed.current = [];
            setPhotos([]);
            setSessionComplete(false);
            setExpectedPhotos(
              [2, 3, 4, 6].includes(Number(message.count))
                ? Number(message.count)
                : 4,
            );
            return;
          }
          const run = sequence.current;
          if (!run || message.run !== run.id) return;
          if (message.type === "complete") {
            clearShots();
            setSessionComplete(true);
            setState("completed");
          }
          if (message.type === "schedule") {
            const { id: shotId, at } = message;
            const localTime =
              typeof at === "number" ? at - p.offset(host) : NaN;
            if (
              !readyRef.current ||
              typeof shotId !== "string" ||
              !Number.isFinite(localTime) ||
              Math.abs(localTime - Date.now()) > 20000 ||
              shots.current.size > 0
            ) {
              failure(
                new Error(
                  "Shared timing was invalid or the camera was not ready.",
                ),
              );
              return;
            }
            shots.current.set(shotId, {
              photos: new Map(),
              timer: setTimeout(
                () => failure(new Error("The group photo did not arrive.")),
                60000,
              ),
            });
            void capture(localTime, run)
              .then((photo) => {
                if (sequence.current === run)
                  return p.sendPhoto([host], shotId, photo);
              })
              .catch((e) => {
                if (sequence.current === run) failure(e);
              });
          }
        },
      });
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

  function publishReady(value: boolean) {
    readyRef.current = value;
    setReady(value);
    if (!value && sequence.current) {
      failure(
        new Error(
          "A camera became unavailable. Start again when everyone is ready.",
        ),
      );
    }
    for (const member of openIds) {
      try {
        peer.current?.send([member], { type: "ready", value });
      } catch {
        // A closed link clears its readiness independently.
      }
    }
  }

  const cameraUnavailable = useEffectEvent(() => publishReady(false));
  useEffect(() => {
    if (!camera.ready && readyRef.current) cameraUnavailable();
  }, [camera.ready]);

  const guests = present.filter((member) => member !== uid);
  const connected =
    guests.length > 0 && guests.every((member) => openIds.includes(member));
  const groupReady = connected && guests.every((member) => remoteReady[member]);

  async function start() {
    const p = peer.current;
    if (
      sequence.current ||
      !isHost ||
      !ready ||
      !camera.ready ||
      !groupReady ||
      !p?.open
    )
      return;
    const run = { id: crypto.randomUUID(), guests };
    const members = [uid, ...guests];
    if (activeLayout === "spotlight" && members.includes(spotlight)) {
      members.splice(members.indexOf(spotlight), 1);
      members.unshift(spotlight);
    }
    const count = booth.settings.count;
    sequence.current = run;
    setWorking(true);
    setError("");
    completed.current = [];
    setPhotos([]);
    setSessionComplete(false);
    setExpectedPhotos(count);
    try {
      p.send(guests, { type: "reset", run: run.id, count });
      for (let i = 0; i < count; i++) {
        const shotId = crypto.randomUUID();
        const at =
          Date.now() +
          booth.settings.countdown * 1000 +
          Math.max(300, p.latency * 2);
        const incoming = new Map<string, string>();
        const received = new Promise<void>((resolve) => {
          shots.current.set(shotId, {
            photos: incoming,
            resolve,
            timer: setTimeout(
              () =>
                failure(
                  new Error(
                    "A guest photo did not arrive. Reconnect and try again.",
                  ),
                ),
              45000,
            ),
          });
        });
        p.send(guests, { type: "schedule", run: run.id, id: shotId, at });
        incoming.set(uid, await capture(at, run));
        await received;
        if (sequence.current !== run) return;
        clearTimeout(shots.current.get(shotId)?.timer);
        shots.current.delete(shotId);
        const result = await composeGroup(
          members.map((member) => incoming.get(member)!),
          activeLayout,
        );
        if (sequence.current !== run) return;
        await p.sendPhoto(guests, shotId, result);
        if (sequence.current !== run) return;
        appendPhoto(result);
      }
      p.send(guests, { type: "complete", run: run.id });
      clearShots();
      setSessionComplete(true);
      setState("completed");
    } catch (e) {
      if (sequence.current === run)
        failure(e instanceof Error ? e : new Error("Shared capture failed."));
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
  return (
    <section className="page room-page">
      <div className="capture-heading">
        <div>
          <span className="eyebrow">A PRIVATE BOOTH FOR UP TO FIVE</span>
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
              <UsersRound size={18} /> {present.length || 1}/5 in the booth
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
          <div
            className={`room-cameras ${previewStack ? "stack" : guests.length >= 2 ? "group" : ""}`}
          >
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

            {(guests.length ? guests : [""]).map((member, index) => (
              <div className="room-video camera-stage" key={member}>
                <RemoteCamera stream={streams[member]} />
                {!streams[member] && (
                  <div className="camera-empty">
                    <UsersRound size={32} />
                    <h3>
                      {member ? "Connecting camera…" : "Waiting for friends"}
                    </h3>
                    {!member && (
                      <p>Share the private link to invite up to four guests.</p>
                    )}
                  </div>
                )}
                {member && (
                  <span className="camera-caption">
                    {room.members.find((m) => m.user_id === member)?.nickname ||
                      `Guest ${index + 1}`}
                    {member === room.host_id ? " · host" : ""}
                    {remoteReady[member] ? " · ready" : ""}
                  </span>
                )}
              </div>
            ))}
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
                !camera.ready || !online || working || state === "expired"
              }
              onClick={() => void connect()}
            >
              <RefreshCw size={16} />
              {present.length > 0 ? "Reconnect" : "Connect cameras"}
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
                publishReady(false);
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
              onClick={() => setPreviewStack((stack) => !stack)}
            >
              <LayoutTemplate size={20} />
            </button>
            <div className="grow" />
            <button
              className={`button ${ready ? "secondary" : "primary"} small`}
              disabled={!connected || working || !cameraOn || !camera.ready}
              aria-pressed={ready}
              onClick={() => publishReady(!ready)}
            >
              <Check size={17} />
              {ready ? "You’re ready" : "I’m ready"}
            </button>
            {isHost && (
              <button
                className="button primary small"
                disabled={
                  !ready ||
                  !groupReady ||
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
                ? "Waiting for the other cameras to connect."
                : !ready
                  ? "Press I’m ready when you’re in position."
                  : !groupReady
                    ? "Waiting for everyone to press I’m ready."
                    : "Everyone is ready. The host can start the shared countdown."}
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

          {isHost && present.length >= 2 && (
            <fieldset className="group-layouts" disabled={working}>
              <legend>Group Polaroid layout</legend>
              <div className="group-layout-options">
                {(Object.keys(groupLayouts) as GroupLayout[])
                  .filter((option) =>
                    groupLayouts[option].sizes.includes(present.length),
                  )
                  .map((option) => (
                    <button
                      type="button"
                      key={option}
                      className="group-layout-option"
                      aria-pressed={activeLayout === option}
                      onClick={() => setLayout(option)}
                    >
                      <svg viewBox="0 0 1200 1200" aria-hidden="true">
                        {groupTiles(present.length, option).map(
                          (tile, index) => (
                            <rect key={index} {...tile} rx="25" />
                          ),
                        )}
                      </svg>
                      {groupLayoutName(option, present.length)}
                    </button>
                  ))}
              </div>
              {activeLayout === "spotlight" && (
                <label>
                  Featured person
                  <select
                    value={
                      [uid, ...guests].includes(spotlight) ? spotlight : uid
                    }
                    onChange={(e) => setSpotlight(e.target.value)}
                  >
                    {[uid, ...guests].map((member) => (
                      <option key={member} value={member}>
                        {room.members.find((m) => m.user_id === member)
                          ?.nickname || (member === uid ? "You" : "Guest")}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </fieldset>
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
                    booth.setEditor({
                      caption: room.name,
                      template: "polaroid",
                      frame: "#fffaf5",
                      sticker: "",
                      polaroidMoment: 0,
                    });
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
              Invite-only · Photos shared with your group · No cloud photo
              storage
            </span>
          </div>
        </>
      )}
    </section>
  );
}
