// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  PhotoTransport,
  checksum,
  CHUNK_SIZE,
  MAX_PHOTO_SIZE,
} from "./transfer";
function channel() {
  return {
    readyState: "open",
    bufferedAmount: 0,
    send: vi.fn(),
  } as unknown as RTCDataChannel;
}
describe("verified peer photo transport", () => {
  it("transfers multiple chunks, verifies integrity, and confirms delivery", async () => {
    const a = channel(),
      b = channel();
    const photo = vi.fn(),
      fail = vi.fn();
    const sender = new PhotoTransport(a, vi.fn(), fail);
    const receiver = new PhotoTransport(b, photo, fail);
    a.send = (raw) => {
      void receiver.receive(JSON.parse(String(raw))).catch(fail);
    };
    b.send = (raw) => {
      void sender.receive(JSON.parse(String(raw))).catch(fail);
    };
    const data = "data:image/jpeg;base64," + "A".repeat(CHUNK_SIZE * 3 + 77);
    await sender.sendPhoto("shot-01", data);
    expect(photo).toHaveBeenCalledExactlyOnceWith("shot-01", data);
    expect(fail).not.toHaveBeenCalled();
    sender.dispose();
    receiver.dispose();
  });
  it("rejects altered or truncated image data before delivering it", async () => {
    const photo = vi.fn(),
      receiver = new PhotoTransport(channel(), photo, vi.fn());
    await receiver.receive({
      type: "photo-start",
      id: "bad",
      shot: "s",
      size: 4,
      hash: await checksum("good"),
    });
    await receiver.receive({
      type: "photo-chunk",
      id: "bad",
      index: 0,
      data: "evil",
    });
    await expect(
      receiver.receive({ type: "photo-end", id: "bad" }),
    ).rejects.toThrow("verification");
    expect(photo).not.toHaveBeenCalled();
    receiver.dispose();
  });
  it("bounds incoming size and rejects out-of-order chunks", async () => {
    const receiver = new PhotoTransport(channel(), vi.fn(), vi.fn());
    await expect(
      receiver.receive({
        type: "photo-start",
        id: "big",
        size: MAX_PHOTO_SIZE + 1,
        shot: "s",
        hash: "x",
      }),
    ).rejects.toThrow("Invalid");
    await receiver.receive({
      type: "photo-start",
      id: "order",
      size: 4,
      shot: "s",
      hash: "x",
    });
    await expect(
      receiver.receive({
        type: "photo-chunk",
        id: "order",
        index: 1,
        data: "data",
      }),
    ).rejects.toThrow("Incomplete");
    receiver.dispose();
  });
  it("times out missing photos and releases all pending state", async () => {
    vi.useFakeTimers();
    const failure = vi.fn(),
      receiver = new PhotoTransport(channel(), vi.fn(), failure);
    await receiver.receive({
      type: "photo-start",
      id: "late",
      size: 4,
      shot: "s",
      hash: "x",
    });
    await vi.advanceTimersByTimeAsync(45001);
    expect(failure).toHaveBeenCalledOnce();
    receiver.dispose();
    vi.useRealTimers();
  });
});
