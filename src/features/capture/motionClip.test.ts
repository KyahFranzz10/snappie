import { afterEach, describe, expect, it, vi } from "vitest";
import { startMotionClip, canRecordMotion } from "./motionClip";
const captureStream = vi.fn();
Object.defineProperty(HTMLCanvasElement.prototype, "captureStream", {
  configurable: true,
  value: captureStream,
});
class TestRecorder {
  static isTypeSupported(type: string) {
    return type === "video/webm";
  }
  state = "inactive";
  mimeType = "video/webm";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    queueMicrotask(() => {
      this.ondataavailable?.({
        data: new Blob(["test video"], { type: "video/webm" }),
      });
      this.onstop?.();
    });
  }
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function setup() {
  vi.stubGlobal("MediaRecorder", TestRecorder);
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const sourceStop = vi.fn(),
    recordingStop = vi.fn();
  const video = document.createElement("video");
  Object.defineProperties(video, {
    videoWidth: { value: 1920 },
    videoHeight: { value: 1080 },
    readyState: { value: 2 },
  });
  video.srcObject = {
    getTracks: () => [{ stop: sourceStop }],
  } as unknown as MediaStream;
  captureStream.mockReturnValue({ getTracks: () => [{ stop: recordingStop }] });
  const context = {
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    imageSmoothingQuality: "high",
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  return { video, sourceStop, recordingStop, context };
}
describe("countdown video lifecycle", () => {
  it("finishes a silent mirrored clip and releases only the recording tracks", async () => {
    const { video, sourceStop, recordingStop, context } = setup();
    const clip = startMotionClip(video);
    const blob = await clip.finish();
    expect(blob.type).toBe("video/webm");
    expect(blob.size).toBeGreaterThan(0);
    expect(context.setTransform).toHaveBeenCalledWith(-1, 0, 0, 1, 1280, 0);
    expect(captureStream).toHaveBeenCalledWith(24);
    expect(recordingStop).toHaveBeenCalledOnce();
    expect(sourceStop).not.toHaveBeenCalled();
  });
  it("discards a cancelled clip while leaving the webcam usable", async () => {
    const { video, sourceStop, recordingStop } = setup();
    const clip = startMotionClip(video);
    clip.cancel();
    await expect(clip.finish()).rejects.toMatchObject({ name: "AbortError" });
    expect(recordingStop).toHaveBeenCalledOnce();
    expect(sourceStop).not.toHaveBeenCalled();
  });
  it("bounds recording time and cleans up on timeout", async () => {
    vi.useFakeTimers();
    const { video, recordingStop } = setup();
    const clip = startMotionClip(video);
    await vi.advanceTimersByTimeAsync(15001);
    await expect(clip.finish()).rejects.toThrow("timed out");
    expect(recordingStop).toHaveBeenCalledOnce();
  });
  it("keeps unsupported browsers on the still-photo path", () => {
    vi.stubGlobal("MediaRecorder", undefined);
    expect(canRecordMotion()).toBe(false);
    expect(() => startMotionClip(document.createElement("video"))).toThrow(
      "not supported",
    );
  });
});
