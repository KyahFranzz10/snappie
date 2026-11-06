import { cover, imageFrom } from "./compose";

export type GroupLayout = "equal" | "spotlight" | "stack" | "contact";

export const groupLayouts: Record<
  GroupLayout,
  { name: string; sizes: number[] }
> = {
  equal: { name: "Classic Grid", sizes: [2, 3, 4, 5] },
  spotlight: { name: "Spotlight", sizes: [3, 4, 5] },
  stack: { name: "Stacked Duo", sizes: [2] },
  contact: { name: "Contact Sheet", sizes: [3, 5] },
};

const equalNames: Record<number, string> = {
  2: "Classic Duo",
  3: "Equal Trio",
  4: "Classic Quad",
  5: "Equal Five",
};

const spotlightNames: Record<number, string> = {
  3: "Spotlight Trio",
  4: "Spotlight Quad",
  5: "Spotlight Five",
};

export function groupLayoutName(layout: GroupLayout, count: number) {
  if (layout === "spotlight") return spotlightNames[count] ?? "Spotlight";
  return layout === "equal"
    ? (equalNames[count] ?? "Classic Grid")
    : groupLayouts[layout].name;
}

type Tile = { x: number; y: number; width: number; height: number };

export function groupTiles(count: number, layout: GroupLayout): Tile[] {
  const gap = 12;
  const size = 1200;
  const half = (size - gap) / 2;
  const row = (
    count: number,
    columns: number,
    y: number,
    height: number,
    x = 0,
    area = size,
  ) => {
    const width = (area - gap * (columns - 1)) / columns;
    const inset = ((columns - count) * (width + gap)) / 2;
    return Array.from({ length: count }, (_, i) => ({
      x: x + inset + i * (width + gap),
      y,
      width,
      height,
    }));
  };

  if (layout === "stack")
    return [...row(1, 1, 0, half), ...row(1, 1, half + gap, half)];
  if (layout === "spotlight" && count === 3)
    return [
      { x: 0, y: 0, width: half, height: size },
      ...row(1, 1, 0, half, half + gap, half),
      ...row(1, 1, half + gap, half, half + gap, half),
    ];
  if (layout === "spotlight") {
    const height = count === 5 ? (size - half - 2 * gap) / 2 : half;
    return [
      ...row(1, 1, 0, half),
      ...row(count === 5 ? 2 : 3, count === 5 ? 2 : 3, half + gap, height),
      ...(count === 5 ? row(2, 2, half + 2 * gap + height, height) : []),
    ];
  }
  if (layout === "contact") {
    if (count === 3) return row(3, 3, 0, size);
    const height = (size - gap * 2) / 3;
    return [
      ...row(2, 2, 0, height),
      ...row(2, 2, height + gap, height),
      ...row(1, 2, 2 * (height + gap), height),
    ];
  }
  if (count <= 2) return row(count, count, 0, size);
  const columns = count === 5 ? 3 : 2;
  return [
    ...row(columns, columns, 0, half),
    ...row(count - columns, columns, half + gap, half),
  ];
}

export async function composeGroup(photos: string[], layout: GroupLayout) {
  const images = await Promise.all(photos.map(imageFrom));
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1200;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fffaf5";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  groupTiles(images.length, layout).forEach(({ x, y, width, height }, i) => {
    const image = images[i];
    cover(ctx, image, image.width, image.height, x, y, width, height);
  });
  return canvas.toDataURL("image/jpeg", 0.94);
}
