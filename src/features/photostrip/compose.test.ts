import { describe, expect, it } from "vitest";
import { dimensions, filterCSS } from "./compose";
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
});
