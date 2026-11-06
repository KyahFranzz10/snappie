import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../supabase/client";
import { PhotoTransport } from "./transfer";
export interface RoomMember {
  user_id: string;
  nickname: string;
}
export interface RoomInfo {
  id: string;
  name: string;
  host_id: string;
  expires_at: string;
  closed: boolean;
}
export type RoomState =
  | "waiting"
  | "connecting"
  | "connected"
  | "ready"
  | "capturing"
  | "processing"
  | "completed"
  | "disconnected"
  | "expired";
interface Callbacks {
  state: (s: RoomState) => void;
  remote: (s: MediaStream) => void;
  message: (p: Record<string, unknown>) => void;
  photo: (id: string, p: string) => void;
  error: (e: Error) => void;
}
class PeerLink {
  private pc: RTCPeerConnection;
  private data: RTCDataChannel | null = null;
  private transport: PhotoTransport | null = null;
  private queued: RTCIceCandidateInit[] = [];
  private disposed = false;
  private connectionTimeout?: ReturnType<typeof setTimeout>;
  private offered = false;
  private timers: ReturnType<typeof setInterval>[] = [];
  private remoteStream = new MediaStream();

  public remoteOffset = 0;
  public latency = 0;
  public open = false;
  constructor(
    private initiator: boolean,
    stream: MediaStream,
    private callbacks: Callbacks,
    private signal: (p: Record<string, unknown>) => Promise<void>,
  ) {
    let iceServers: RTCIceServer[];
    try {
      iceServers = JSON.parse(
        import.meta.env.VITE_ICE_SERVERS ||
          '[{"urls":"stun:stun.l.google.com:19302"}]',
      );
    } catch {
      throw new Error("VITE_ICE_SERVERS must be valid JSON.");
    }
    this.pc = new RTCPeerConnection({ iceServers });
    stream.getTracks().forEach((t) => this.pc.addTrack(t, stream));
    this.pc.addTransceiver("audio", { direction: "sendrecv" });
    this.pc.ontrack = (e) => {
      if (!this.remoteStream.getTracks().some((t) => t.id === e.track.id))
        this.remoteStream.addTrack(e.track);
      callbacks.remote(this.remoteStream);
    };
    this.pc.onicecandidate = (e) => {
      if (e.candidate)
        void this.signal({
          kind: "ice",
          candidate: e.candidate.toJSON(),
        }).catch(callbacks.error);
    };
    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState;
      if (state === "failed" || state === "disconnected") {
        clearTimeout(this.connectionTimeout);
        this.open = false;
        callbacks.state("disconnected");
        callbacks.error(
          new Error("A camera disconnected. Use Reconnect to try again."),
        );
      }
    };
    this.pc.ondatachannel = (e) => this.attach(e.channel);
  }
  async offer() {
    if (this.offered || this.disposed) return;
    this.offered = true;
    this.waitForPeer();
    this.attach(this.pc.createDataChannel("snapbooth", { ordered: true }));
    await this.pc.setLocalDescription(await this.pc.createOffer());
    await this.signal({ kind: "offer", description: this.pc.localDescription });
  }
  async receiveSignal(p: Record<string, unknown>) {
    if (this.disposed) return;
    if (p.kind === "offer" && !this.initiator) {
      this.waitForPeer();
      await this.pc.setRemoteDescription(
        p.description as RTCSessionDescriptionInit,
      );
      await this.flushIce();
      await this.pc.setLocalDescription(await this.pc.createAnswer());
      await this.signal({
        kind: "answer",
        description: this.pc.localDescription,
      });
    } else if (p.kind === "answer" && this.initiator) {
      await this.pc.setRemoteDescription(
        p.description as RTCSessionDescriptionInit,
      );
      await this.flushIce();
    } else if (p.kind === "ice") {
      if (this.pc.remoteDescription)
        await this.pc.addIceCandidate(p.candidate as RTCIceCandidateInit);
      else this.queued.push(p.candidate as RTCIceCandidateInit);
    }
  }
  private async flushIce() {
    for (const candidate of this.queued)
      await this.pc.addIceCandidate(candidate);
    this.queued = [];
  }
  private waitForPeer() {
    clearTimeout(this.connectionTimeout);
    this.callbacks.state("connecting");
    this.connectionTimeout = setTimeout(() => {
      if (this.disposed || this.open) return;
      this.callbacks.error(
        new Error(
          "A camera could not establish a direct connection. Reconnect and try again. If they’re on different networks, check your TURN server configuration.",
        ),
      );
    }, 20000);
  }
  private attach(data: RTCDataChannel) {
    this.data = data;
    this.transport = new PhotoTransport(
      data,
      this.callbacks.photo,
      this.callbacks.error,
    );
    data.onopen = () => {
      if (this.disposed) return;
      clearTimeout(this.connectionTimeout);
      this.open = true;
      this.callbacks.state("connected");
      this.ping();
      this.timers.push(setInterval(() => this.ping(), 5000));
    };
    data.onclose = () => {
      this.open = false;
      if (!this.disposed) this.callbacks.state("disconnected");
    };
    data.onmessage = (e) => {
      void (async () => {
        try {
          if (typeof e.data !== "string" || e.data.length > 20000)
            throw new Error("Unexpected room message.");
          const p = JSON.parse(e.data) as Record<string, unknown>;
          if (typeof p.type !== "string") return;
          if (p.type.startsWith("photo-")) {
            await this.transport!.receive({ ...p, type: p.type });
            return;
          }
          if (p.type === "ping") {
            this.send({ type: "pong", t0: p.t0, t1: Date.now() });
            return;
          }
          if (p.type === "pong") {
            const now = Date.now();
            if (typeof p.t0 !== "number" || typeof p.t1 !== "number") return;
            this.latency = (now - p.t0) / 2;
            this.remoteOffset = p.t1 - (p.t0 + now) / 2;
            return;
          }
          this.callbacks.message(p);
        } catch (e) {
          this.callbacks.error(
            e instanceof Error ? e : new Error("Room message failed."),
          );
        }
      })();
    };
  }
  private ping() {
    if (this.open) this.send({ type: "ping", t0: Date.now() });
  }
  send(p: Record<string, unknown>) {
    if (!this.data || this.data.readyState !== "open")
      throw new Error("Connect with the other cameras first.");
    this.data.send(JSON.stringify(p));
  }
  sendPhoto(id: string, photo: string) {
    if (!this.transport)
      return Promise.reject(new Error("Photo connection is not ready."));
    return this.transport.sendPhoto(id, photo);
  }
  async setMicrophone(audio: MediaStream) {
    if (this.disposed) return;
    const sender =
      this.pc.getSenders().find((s) => s.track?.kind === "audio") ||
      this.pc.getTransceivers().find((t) => t.receiver.track.kind === "audio")
        ?.sender;
    if (!sender) throw new Error("Audio connection is unavailable.");
    await sender.replaceTrack(audio.getAudioTracks()[0]);
  }
  dispose() {
    this.disposed = true;
    this.open = false;
    clearTimeout(this.connectionTimeout);
    this.timers.forEach(clearInterval);
    this.transport?.dispose();
    this.data?.close();
    this.pc.close();
    this.remoteStream.getTracks().forEach((t) => t.stop());
  }
}

type GroupCallbacks = {
  state: (state: RoomState) => void;
  presence: (ids: string[]) => void;
  remote: (id: string, stream: MediaStream | null) => void;
  connection: (id: string, open: boolean) => void;
  message: (id: string, message: Record<string, unknown>) => void;
  photo: (id: string, shot: string, photo: string) => void;
  error: (error: Error) => void;
};

export class BoothPeer {
  private channel: RealtimeChannel;
  private session = crypto.randomUUID();
  private links = new Map<string, { session: string; peer: PeerLink }>();
  private audio: MediaStream | null = null;
  private disposed = false;

  constructor(
    private room: RoomInfo,
    private uid: string,
    private stream: MediaStream,
    private callbacks: GroupCallbacks,
  ) {
    this.channel = supabase!.channel(`room:${room.id}`, {
      config: {
        private: true,
        broadcast: { ack: true, self: false },
        presence: { key: uid },
      },
    });
    this.channel
      .on("presence", { event: "sync" }, () => this.sync())
      .on("broadcast", { event: "signal" }, ({ payload }) => {
        if (this.disposed) return;
        if (payload.kind === "closed" && payload.from === this.room.host_id) {
          callbacks.message(payload.from, { type: "closed" });
          return;
        }
        if (payload.to !== uid || payload.toSession !== this.session) return;
        const link = this.links.get(payload.from);
        if (!link || payload.fromSession !== link.session) return;
        const task =
          payload.kind === "hello"
            ? link.peer.offer()
            : link.peer.receiveSignal(payload);
        void task.catch((e) => this.report(link.peer, e));
      });
  }

  private report(peer: PeerLink, e: unknown) {
    if (
      !this.disposed &&
      [...this.links.values()].some((link) => link.peer === peer)
    )
      this.callbacks.error(
        e instanceof Error ? e : new Error("Camera connection failed."),
      );
  }

  private sync() {
    if (this.disposed) return;
    const presence = this.channel.presenceState<{ session: string }>();
    if (!presence[this.uid]?.some((entry) => entry.session === this.session))
      return;
    const ids = [
      this.uid,
      ...Object.keys(presence)
        .filter((id) => id !== this.uid)
        .sort(),
    ].slice(0, 5);
    this.callbacks.presence(ids);
    for (const [id, link] of this.links) {
      if (ids.includes(id) && presence[id]?.at(-1)?.session === link.session)
        continue;
      this.links.delete(id);
      link.peer.dispose();
      this.callbacks.remote(id, null);
      this.callbacks.connection(id, false);
    }
    for (const id of ids.slice(1)) {
      const session = presence[id]?.at(-1)?.session;
      if (!session || this.links.has(id)) continue;
      try {
        const initiator = this.uid < id;
        const signal = (message: Record<string, unknown>) =>
          this.signal({ ...message, to: id, toSession: session });
        const peer = new PeerLink(
          initiator,
          this.stream,
          {
            state: (state) => {
              if (this.links.get(id)?.peer !== peer) return;
              if (state === "connected" || state === "disconnected")
                this.callbacks.connection(id, state === "connected");
              this.updateState();
            },
            remote: (stream) => this.callbacks.remote(id, stream),
            message: (message) => this.callbacks.message(id, message),
            photo: (shot, photo) => this.callbacks.photo(id, shot, photo),
            error: (error) => this.report(peer, error),
          },
          signal,
        );
        this.links.set(id, { session, peer });
        if (this.audio)
          void peer
            .setMicrophone(this.audio)
            .catch((e) => this.report(peer, e));
      } catch (e) {
        this.callbacks.error(
          e instanceof Error ? e : new Error("Camera setup failed."),
        );
      }
    }
    // The answering side announces that it has created its link. Presence syncs
    // can arrive in either order, so retry this announcement while connecting.
    this.announce();
    this.updateState();
  }

  private announce() {
    for (const [id, { peer, session }] of this.links) {
      if (this.uid > id && !peer.open)
        void this.signal({ kind: "hello", to: id, toSession: session }).catch(
          (e) => this.report(peer, e),
        );
    }
  }

  private updateState() {
    this.callbacks.state(
      this.open ? "connected" : this.links.size ? "connecting" : "waiting",
    );
  }

  get open() {
    return (
      this.links.size > 0 &&
      [...this.links.values()].every(({ peer }) => peer.open)
    );
  }

  get latency() {
    return Math.max(
      0,
      ...[...this.links.values()].map(({ peer }) => peer.latency),
    );
  }

  offset(id: string) {
    return this.links.get(id)?.peer.remoteOffset ?? 0;
  }

  async connect() {
    const session = (await supabase!.auth.getSession()).data.session;
    if (!session)
      throw new Error(
        "Your room session has expired. Open the invitation again.",
      );
    await supabase!.realtime.setAuth(session.access_token);
    if (this.disposed) return;
    await new Promise<void>((resolve, reject) => {
      this.cancelConnect = () => finish();
      const timeout = setTimeout(
        () =>
          finish(
            new Error(
              "Room signaling timed out. Check your connection and retry.",
            ),
          ),
        15000,
      );
      const finish = (error?: Error) => {
        clearTimeout(timeout);
        this.cancelConnect = undefined;
        if (error) reject(error);
        else resolve();
      };
      this.channel.subscribe(async (status, err) => {
        if (this.disposed) return;
        if (status === "SUBSCRIBED") {
          try {
            const tracked = await this.channel.track({ session: this.session });
            if (tracked !== "ok")
              throw new Error("Could not announce your camera in the room.");
            finish();
          } catch (e) {
            finish(e instanceof Error ? e : new Error("Room presence failed."));
          }
        } else if (["CLOSED", "CHANNEL_ERROR", "TIMED_OUT"].includes(status)) {
          const error = new Error(
            err?.message ||
              "Private room signaling is unavailable. Reconnect to try again.",
          );
          if (this.cancelConnect) finish(error);
          else this.callbacks.error(error);
        }
      });
    });
    if (!this.disposed)
      this.announcement = setInterval(() => this.announce(), 1500);
  }

  private cancelConnect?: () => void;
  private announcement?: ReturnType<typeof setInterval>;

  private async signal(message: Record<string, unknown>) {
    if (this.disposed) return;
    const status = await this.channel.send({
      type: "broadcast",
      event: "signal",
      payload: { ...message, from: this.uid, fromSession: this.session },
    });
    if (status !== "ok") throw new Error("Could not send connection message.");
  }

  send(ids: readonly string[], message: Record<string, unknown>) {
    for (const id of ids) this.link(id).send(message);
  }

  async sendPhoto(ids: readonly string[], shot: string, photo: string) {
    await Promise.all(ids.map((id) => this.link(id).sendPhoto(shot, photo)));
  }

  private link(id: string) {
    const peer = this.links.get(id)?.peer;
    if (!peer?.open)
      throw new Error("A camera disconnected. Reconnect to try again.");
    return peer;
  }

  async microphone() {
    if (this.audio) return;
    const audio = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    try {
      if (this.disposed) throw new Error("Room left.");
      this.audio = audio;
      await Promise.all(
        [...this.links.values()].map(({ peer }) => peer.setMicrophone(audio)),
      );
    } catch (e) {
      audio.getTracks().forEach((track) => track.stop());
      this.audio = null;
      throw e;
    }
  }

  mute(muted: boolean) {
    this.audio?.getAudioTracks().forEach((track) => (track.enabled = !muted));
  }

  async closeRoom() {
    try {
      await this.signal({ kind: "closed" });
    } catch {
      // Database closure remains authoritative.
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.announcement);
    this.cancelConnect?.();
    for (const { peer } of this.links.values()) peer.dispose();
    this.links.clear();
    this.audio?.getTracks().forEach((track) => track.stop());
    return supabase!.removeChannel(this.channel);
  }
}
