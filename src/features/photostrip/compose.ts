import type { EditorSettings } from "../../types";
export const filters = {
  original: "",
  mono: "grayscale(1)",
  vintage: "sepia(.45)",
  warm: "sepia(.25) saturate(1.2)",
  cool: "hue-rotate(15deg) saturate(.8)",
  film: "sepia(.2) contrast(1.12) saturate(.75)",
};
export function filterCSS(s: EditorSettings) {
  return `${filters[s.filter]} brightness(${s.brightness}%) contrast(${s.contrast}%) saturate(${s.saturation}%)`;
}
export const dimensions = (template: EditorSettings["template"]) =>
  template === "strip"
    ? { width: 600, height: 1800 }
    : template === "story"
      ? { width: 1080, height: 1920 }
      : { width: 1800, height: 1200 };
export function imageFrom(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () =>
      reject(new Error("This photo could not be opened. Please retake it."));
    i.src = src;
  });
}
export function cover(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  sw: number,
  sh: number,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const scale = Math.max(w / sw, h / sh);
  const cw = w / scale,
    ch = h / scale;
  ctx.drawImage(img, (sw - cw) / 2, (sh - ch) / 2, cw, ch, x, y, w, h);
}
export async function compose(
  photos: string[],
  s: EditorSettings,
  logo = "",
): Promise<HTMLCanvasElement> {
  if (!photos.length) throw new Error("Take a few photos first.");
  const { width: w, height: h } = dimensions(s.template);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const images = await Promise.all(photos.map(imageFrom));
  const logoImage = logo ? await imageFrom(logo) : undefined;
  drawComposition(
    canvas,
    images.map((image) => ({
      image,
      width: image.width,
      height: image.height,
    })),
    s,
    logoImage,
  );
  return canvas;
}
export interface CompositionSource {
  image: CanvasImageSource;
  width: number;
  height: number;
}
export function drawComposition(
  canvas: HTMLCanvasElement,
  sources: CompositionSource[],
  s: EditorSettings,
  logoImage?: HTMLImageElement,
) {
  const w = canvas.width,
    h = canvas.height;
  const c = canvas.getContext("2d")!;
  c.clearRect(0, 0, w, h);
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = "high";
  if (s.frame !== "transparent") {
    c.fillStyle = s.frame;
    c.fillRect(0, 0, w, h);
  }
  const dark = ["#302a36", "#9d3853"].includes(s.frame);
  c.fillStyle = dark ? "#fffaf5" : "#4c3340";
  const story = s.template === "story";
  const pad = story ? 72 : s.template === "strip" ? 30 : 48;
  const top = story ? 210 : pad;
  const bottom = story ? 210 : pad;
  const footer = story ? 180 : s.template === "strip" ? 180 : 160;
  const footerTop = h - (story ? bottom : 0) - footer;
  const cols = story
    ? sources.length > 3
      ? 2
      : 1
    : s.template === "strip"
      ? 1
      : Math.ceil(sources.length / 2);
  const rows = Math.ceil(sources.length / cols);
  const gap = 16;
  const pw = (w - pad * 2 - gap * (cols - 1)) / cols,
    ph = (h - top - bottom - footer - gap * (rows - 1)) / rows;
  sources.forEach((source, i) => {
    c.save();
    c.filter = filterCSS(s);
    cover(
      c,
      source.image,
      source.width,
      source.height,
      pad + (i % cols) * (pw + gap),
      top + Math.floor(i / cols) * (ph + gap),
      pw,
      ph,
    );
    c.restore();
  });
  c.textAlign = "center";
  c.font = `${s.template === "strip" ? 40 : 48}px Georgia`;
  c.fillText("snappie", w / 2, footerTop + 45);
  c.font = `${s.template === "strip" ? 18 : 28}px sans-serif`;
  c.fillText(s.caption.slice(0, 65), w / 2, footerTop + 84, w - pad * 2);
  if (s.date)
    c.fillText(
      (s.dateValue
        ? new Date(`${s.dateValue}T12:00:00`)
        : new Date()
      ).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      w / 2,
      h - (story ? bottom + 12 : 42),
    );
  if (s.sticker) {
    c.font = "52px sans-serif";
    c.fillText(s.sticker, w - pad - 18, footerTop + 45);
  }
  if (s.text) {
    c.font = `bold ${s.template === "strip" ? 32 : 48}px sans-serif`;
    c.lineWidth = 3;
    c.strokeStyle = dark ? "#302a36" : "#fffaf5";
    c.strokeText(
      s.text.slice(0, 60),
      (w * s.textX) / 100,
      (h * s.textY) / 100,
      w - 2 * pad,
    );
    c.fillText(
      s.text.slice(0, 60),
      (w * s.textX) / 100,
      (h * s.textY) / 100,
      w - 2 * pad,
    );
  }
  if (logoImage) {
    c.drawImage(logoImage, pad, story ? h - bottom - 70 : h - 100, 70, 70);
  }
}
export async function pairPhotos(
  a: string,
  b: string,
  layout: "side" | "stack",
) {
  const images = await Promise.all([imageFrom(a), imageFrom(b)]);
  const c = document.createElement("canvas");
  c.width = 1200;
  c.height = 900;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  images.forEach((im, i) =>
    cover(
      ctx,
      im,
      im.width,
      im.height,
      layout === "side" ? i * 600 : 0,
      layout === "stack" ? i * 450 : 0,
      layout === "side" ? 600 : 1200,
      layout === "side" ? 900 : 450,
    ),
  );
  return c.toDataURL("image/jpeg", 0.94);
}
export async function downloadCanvas(
  canvas: HTMLCanvasElement,
  type: "png" | "jpeg",
) {
  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob(
      (b) => (b ? res(b) : rej(new Error("Export failed."))),
      `image/${type}`,
      0.96,
    ),
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `snappie-${Date.now()}.${type === "jpeg" ? "jpg" : "png"}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function printCanvas(
  canvas: HTMLCanvasElement,
  template: EditorSettings["template"],
) {
  const frame = document.createElement("iframe");
  frame.title = "Snappie print";
  frame.style.cssText = "position:fixed;width:0;height:0;border:0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(
    `<!doctype html><html><head><title>Snappie</title><style>@page{size:${template === "strip" ? "2in 6in" : "6in 4in"};margin:0}body{margin:0}img{display:block;width:100%;height:auto}</style></head><body><img alt="Your photostrip" src="${canvas.toDataURL("image/png")}"></body></html>`,
  );
  doc.close();
  const img = doc.querySelector("img")!;
  const print = () => {
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
    setTimeout(() => frame.remove(), 60000);
  };
  if (img.complete) print();
  else img.onload = print;
}
