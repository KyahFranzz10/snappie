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
  presence: (ids: string[]) => void;
}
export class BoothPeer {
  private pc: RTCPeerConnection;
  private channel: RealtimeChannel;
  private data: RTCDataChannel | null = null;
  private transport: PhotoTransport | null = null;
  private queued: RTCIceCandidateInit[] = [];
  private disposed = false;
  private removal: Promise<unknown> | null = null;
  private connectionTimeout?: ReturnType<typeof setTimeout>;
  private offered = false;
  private timers: ReturnType<typeof setInterval>[] = [];
  private remoteStream = new MediaStream();
  private audio: MediaStream | null = null;
  public remoteOffset = 0;
  public latency = 0;
  public open = false;
  constructor(
    private room: RoomInfo,
    private uid: string,
    private partner: string | null,
    stream: MediaStream,
    private callbacks: Callbacks,
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
          new Error(
            "Your partner disconnected. Both participants can reconnect below.",
          ),
        );
      }
    };
    this.pc.ondatachannel = (e) => this.attach(e.channel);
    this.channel = supabase!.channel(`room:${room.id}`, {
      config: {
        private: true,
        broadcast: { ack: true, self: false },
        presence: { key: uid },
      },
    });
    this.channel
      .on("broadcast", { event: "signal" }, ({ payload }) => {
        void this.receiveSignal(payload).catch(callbacks.error);
      })
      .on("presence", { event: "sync" }, () => {
        const ids = Object.keys(this.channel.presenceState());
        callbacks.presence(ids);
        const other = ids.find((id) => id !== uid);
        if (other) {
          this.partner = other;
          if (uid === room.host_id && !this.offered)
            void this.offer().catch(callbacks.error);
        }
      });
  }
  async connect() {
    const session = (await supabase!.auth.getSession()).data.session;
    if (!session)
      throw new Error(
        "Your room session has expired. Open the invitation again.",
      );
    await supabase!.realtime.setAuth(session?.access_token);
    if (this.disposed) return;
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () =>
          reject(
            new Error(
              "Room signaling timed out. Check your connection and retry.",
            ),
          ),
        15000,
      );
      this.channel.subscribe(async (status, err) => {
        if (this.disposed) return;
        if (status === "SUBSCRIBED") {
          try {
            if (!this.open && !this.connectionTimeout)
              this.callbacks.state("waiting");
            const tracked = await this.channel.track({ user_id: this.uid });
            if (tracked !== "ok")
              throw new Error(
                "Could not announce your camera in the room. Check Realtime Presence access and reconnect.",
              );
            resolve();
          } catch (e) {
            if (!this.disposed)
              this.callbacks.error(
                e instanceof Error ? e : new Error("Room presence failed."),
              );
            reject(e);
          } finally {
            clearTimeout(timeout);
          }
        } else if (["CLOSED", "CHANNEL_ERROR", "TIMED_OUT"].includes(status)) {
          clearTimeout(timeout);
          this.callbacks.state("disconnected");
          reject(
            new Error(
              err?.message ||
                "Private room signaling is unavailable. Check Supabase authorization and your connection.",
            ),
          );
        }
      });
    });
  }
  private async signal(p: Record<string, unknown>) {
    if (this.disposed) return;
    const status = await this.channel.send({
      type: "broadcast",
      event: "signal",
      payload: { ...p, from: this.uid, to: this.partner },
    });
    if (status !== "ok") throw new Error("Could not send connection message.");
  }
  private async offer() {
    this.offered = true;
    this.waitForPeer();
    this.attach(this.pc.createDataChannel("snapbooth", { ordered: true }));
    await this.pc.setLocalDescription(await this.pc.createOffer());
    await this.signal({ kind: "offer", description: this.pc.localDescription });
  }
  private async receiveSignal(p: Record<string, unknown>) {
    if (
      this.disposed ||
      p.from === this.uid ||
      (p.to && p.to !== this.uid) ||
      typeof p.from !== "string"
    )
      return;
    if (this.partner && p.from !== this.partner) return;
    if (p.kind === "closed" && p.from === this.room.host_id) {
      this.callbacks.message({ type: "closed" });
      return;
    }
    if (p.kind === "offer" && this.uid !== this.room.host_id) {
      this.partner = p.from;
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
    } else if (p.kind === "answer" && this.uid === this.room.host_id) {
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
          "The two cameras could not establish a direct connection. Reconnect in both browsers. If they’re on different networks, check your TURN server configuration.",
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
      throw new Error("Connect with your partner first.");
    this.data.send(JSON.stringify(p));
  }
  sendPhoto(id: string, photo: string) {
    if (!this.transport)
      return Promise.reject(new Error("Photo connection is not ready."));
    return this.transport.sendPhoto(id, photo);
  }
  async microphone() {
    if (this.audio) return;
    const audio = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    if (this.disposed) {
      audio.getTracks().forEach((t) => t.stop());
      return;
    }
    this.audio = audio;
    const sender =
      this.pc.getSenders().find((s) => s.track?.kind === "audio") ||
      this.pc.getTransceivers().find((t) => t.receiver.track.kind === "audio")
        ?.sender;
    if (!sender) {
      audio.getTracks().forEach((t) => t.stop());
      throw new Error("Audio connection is unavailable.");
    }
    await sender.replaceTrack(audio.getAudioTracks()[0]);
  }
  mute(value: boolean) {
    this.audio?.getAudioTracks().forEach((t) => (t.enabled = !value));
  }
  async closeRoom() {
    try {
      await this.signal({ kind: "closed" });
    } catch {
      /* Database close and expiry remain authoritative. */
    }
  }
  dispose() {
    if (this.removal) return this.removal;
    this.disposed = true;
    this.open = false;
    clearTimeout(this.connectionTimeout);
    this.timers.forEach(clearInterval);
    this.transport?.dispose();
    this.data?.close();
    this.pc.close();
    this.audio?.getTracks().forEach((t) => t.stop());
    this.remoteStream.getTracks().forEach((t) => t.stop());
    this.removal = supabase!.removeChannel(this.channel);
    return this.removal;
  }
}
