import { describe, expect, it, vi } from "vitest";
import { dimensions, drawComposition, filterCSS } from "./compose";
import { defaultEditor } from "../../stores/booth";
describe("print composition settings", () => {
  it("exports a full-height 9:16 social story", () => {
    expect(dimensions("story")).toEqual({ width: 1080, height: 1920 });
  });
  it("uses 300 pixels/inch for both supported paper formats", () => {
    expect(dimensions("strip")).toEqual({ width: 600, height: 1800 });
    expect(dimensions("postcard")).toEqual({ width: 1800, height: 1200 });
  });
  it("combines the selected look with all manual adjustments", () => {
    expect(
      filterCSS({
        ...defaultEditor,
        filter: "mono",
        brightness: 80,
        contrast: 120,
        saturation: 90,
      }),
    ).toBe("grayscale(1) brightness(80%) contrast(120%) saturate(90%)");
  });
  it("rotates and mirrors a photo around its slot center without changing the slot size", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 1800;
    const context = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
    };
    vi.spyOn(canvas, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    const image = new Image();
    drawComposition(canvas, [{ image, width: 1200, height: 600 }], {
      ...defaultEditor,
      photoTransforms: [{ rotation: 90, flipped: true }],
    });
    expect(context.translate).toHaveBeenCalledWith(300, 810);
    expect(context.scale).toHaveBeenCalledWith(-1, 1);
    expect(context.rotate).toHaveBeenCalledWith(Math.PI / 2);
    expect(context.drawImage).toHaveBeenCalledWith(
      image,
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      -780,
      -270,
      1560,
      540,
    );
  });
});
