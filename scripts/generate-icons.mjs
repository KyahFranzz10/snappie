import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
// Reproducible camera mark. No remote fonts or image-generation dependency.
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  for (const size of [192, 512]) {
    const png = await page.evaluate((size) => {
      const c = document.createElement("canvas");
      c.width = size;
      c.height = size;
      const x = c.getContext("2d");
      x.scale(size / 192, size / 192);
      x.fillStyle = "#9d3853";
      x.fillRect(0, 0, 192, 192);
      x.fillStyle = "#fff6ed";
      x.beginPath();
      x.roundRect(39, 65, 114, 77, 10);
      x.fill();
      x.beginPath();
      x.roundRect(70, 51, 52, 25, 6);
      x.fill();
      x.fillStyle = "#9d3853";
      x.beginPath();
      x.arc(96, 103, 25, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = "#f4c7cd";
      x.beginPath();
      x.arc(96, 103, 15, 0, Math.PI * 2);
      x.fill();
      return c.toDataURL("image/png").split(",")[1];
    }, size);
    await writeFile(`public/icon-${size}.png`, Buffer.from(png, "base64"));
  }
} finally {
  await browser.close();
}
