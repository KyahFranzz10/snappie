export const CHUNK_SIZE = 12000;
export const MAX_PHOTO_SIZE = 8_000_000;
export async function checksum(data: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data)),
    ),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
}
type Packet = { type: string; [key: string]: unknown };
interface Incoming {
  id: string;
  shot: string;
  size: number;
  hash: string;
  chunks: string[];
  timer: ReturnType<typeof setTimeout>;
}
export class PhotoTransport {
  private incoming = new Map<string, Incoming>();
  private pending = new Map<
    string,
    {
      resolve: () => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor(
    private channel: RTCDataChannel,
    private photo: (shot: string, data: string) => void,
    private failure: (e: Error) => void,
  ) {}
  private send(p: Packet) {
    if (this.channel.readyState !== "open")
      throw new Error("Photo connection closed. Reconnect to try again.");
    this.channel.send(JSON.stringify(p));
  }
  async sendPhoto(shot: string, data: string) {
    if (data.length > MAX_PHOTO_SIZE)
      throw new Error("Photo is too large to transfer.");
    const id = crypto.randomUUID(),
      hash = await checksum(data);
    const ack = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            "A camera did not confirm this photo. Retry the shared session.",
          ),
        );
      }, 45000);
      this.pending.set(id, { resolve, reject, timer });
    });
    void ack.catch(() => {});
    try {
      this.send({ type: "photo-start", id, shot, size: data.length, hash });
      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const end = Date.now() + 15000;
        while (this.channel.bufferedAmount > 256000) {
          if (Date.now() > end || this.channel.readyState !== "open")
            throw new Error("Photo transfer stalled. Reconnect and try again.");
          await new Promise((r) => setTimeout(r, 25));
        }
        this.send({
          type: "photo-chunk",
          id,
          index: i / CHUNK_SIZE,
          data: data.slice(i, i + CHUNK_SIZE),
        });
      }
      this.send({ type: "photo-end", id });
      await ack;
    } catch (e) {
      const p = this.pending.get(id);
      if (p) {
        clearTimeout(p.timer);
        this.pending.delete(id);
        p.reject(e instanceof Error ? e : new Error("Transfer failed."));
      }
      throw e;
    }
  }
  async receive(p: Packet) {
    const id = String(p.id ?? "");
    if (p.type === "photo-ack") {
      const transfer = this.pending.get(id);
      if (transfer) {
        clearTimeout(transfer.timer);
        transfer.resolve();
        this.pending.delete(id);
      }
      return;
    }
    if (p.type === "photo-start") {
      if (
        this.incoming.size >= 4 ||
        typeof p.size !== "number" ||
        p.size < 1 ||
        p.size > MAX_PHOTO_SIZE ||
        typeof p.shot !== "string" ||
        typeof p.hash !== "string"
      )
        throw new Error("Invalid photo transfer.");
      if (this.incoming.has(id)) throw new Error("Duplicate photo transfer.");
      const timer = setTimeout(() => {
        this.incoming.delete(id);
        this.failure(
          new Error(
            "A photo did not arrive in time. Please retry the session.",
          ),
        );
      }, 45000);
      this.incoming.set(id, {
        id,
        shot: p.shot,
        size: p.size,
        hash: p.hash,
        chunks: [],
        timer,
      });
    }
    if (p.type === "photo-chunk") {
      const t = this.incoming.get(id);
      if (
        !t ||
        typeof p.data !== "string" ||
        p.data.length > CHUNK_SIZE ||
        p.index !== t.chunks.length ||
        t.chunks.length >= Math.ceil(t.size / CHUNK_SIZE)
      )
        throw new Error("Incomplete photo transfer.");
      t.chunks.push(p.data);
    }
    if (p.type === "photo-end") {
      const t = this.incoming.get(id);
      if (!t) throw new Error("Missing photo transfer.");
      clearTimeout(t.timer);
      this.incoming.delete(id);
      const data = t.chunks.join("");
      if (
        data.length !== t.size ||
        (await checksum(data)) !== t.hash ||
        !/^data:image\/jpeg;base64,/.test(data)
      )
        throw new Error("Photo verification failed. Please retry.");
      this.photo(t.shot, data);
      this.send({ type: "photo-ack", id });
    }
  }
  dispose() {
    for (const t of this.incoming.values()) clearTimeout(t.timer);
    this.incoming.clear();
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("Connection closed."));
    }
    this.pending.clear();
  }
}
