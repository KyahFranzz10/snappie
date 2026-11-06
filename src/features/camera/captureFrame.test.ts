import { afterEach, describe, expect, it, vi } from "vitest";
import { captureFrame } from "./captureFrame";
afterEach(() => vi.restoreAllMocks());
function setup(width: number, height: number) {
  const video = document.createElement("video");
  Object.defineProperties(video, {
    videoWidth: { value: width },
    videoHeight: { value: height },
    readyState: { value: 2 },
  });
  const context = {
    translate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "low",
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  const output = vi
    .spyOn(HTMLCanvasElement.prototype, "toDataURL")
    .mockImplementation(function (this: HTMLCanvasElement, type) {
      return `${type}:${this.width}x${this.height}`;
    });
  return { video, context, output };
}
describe("webcam frame quality", () => {
  it("keeps a low-resolution feed at its actual size instead of enlarging it", () => {
    const { video, context, output } = setup(640, 480);
    expect(captureFrame(video)).toBe("image/png:640x480");
    expect(output).toHaveBeenCalledWith("image/png");
    expect(context.drawImage).toHaveBeenCalledWith(video, 0, 0, 640, 480);
  });
  it("preserves all pixels and the aspect ratio of a 4K feed", () => {
    const { video, context } = setup(3840, 2160);
    expect(captureFrame(video)).toBe("image/png:3840x2160");
    expect(context.translate).toHaveBeenCalledWith(3840, 0);
    expect(context.scale).toHaveBeenCalledWith(-1, 1);
  });
  it("bounds online JPEG transfers without stretching or upscaling", () => {
    const { video, output } = setup(3840, 2160);
    expect(captureFrame(video, { format: "jpeg", maxDimension: 1920 })).toBe(
      "image/jpeg:1920x1080",
    );
    expect(output).toHaveBeenCalledWith("image/jpeg", 0.98);
  });
  it("rejects frames before the camera has usable dimensions", () => {
    const { video } = setup(0, 0);
    expect(() => captureFrame(video)).toThrow("still getting ready");
  });
});
