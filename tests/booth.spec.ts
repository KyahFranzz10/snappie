import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
async function captureFour(page: Page) {
  await page.goto("/setup");
  await page.getByRole("button", { name: "Open my booth" }).click();
  await page
    .getByRole("button", { name: "Enable camera", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Let’s take some photos" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Let’s take some photos" }).click();
  await expect(page.getByRole("button", { name: "Make it yours" })).toBeVisible(
    { timeout: 25000 },
  );
}
test("camera preview stays compact with capture controls visible on desktop and mobile", async ({
  page,
}) => {
  await page.goto("/capture");
  await page
    .getByRole("button", { name: "Enable camera", exact: true })
    .click();
  await expect(page.getByText(/Camera feed:/)).toBeVisible();
  for (const viewport of [
    { width: 1260, height: 700 },
    { width: 1260, height: 630 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.scrollTo(0, 0));
    const preview = await page
      .locator(".capture-page .camera-stage")
      .boundingBox();
    const button = await page
      .getByRole("button", { name: "Let’s take some photos" })
      .boundingBox();
    expect(preview!.height).toBeLessThanOrEqual(
      viewport.width > 600 ? 440 : 380,
    );
    expect(preview!.y).toBeGreaterThanOrEqual(0);
    expect(button!.y + button!.height).toBeLessThanOrEqual(viewport.height);
    expect(
      await page
        .locator("video")
        .evaluate((v) => getComputedStyle(v).objectFit),
    ).toBe("contain");
    await page.screenshot({
      path: `test-results/camera-${viewport.width}-${viewport.height}.png`,
      fullPage: false,
    });
  }
});
test("four real MediaDevices captures, retake, edit, save, and full-resolution PNG export", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await captureFour(page);
  const sourceSize = await page
    .locator("video")
    .evaluate((v: HTMLVideoElement) => [v.videoWidth, v.videoHeight]);
  const captured = page
    .getByRole("button", { name: "Retake photo 1", exact: true })
    .locator("img");
  await expect(captured).toHaveAttribute("src", /^data:image\/png;base64,/);
  expect(
    await captured.evaluate((image: HTMLImageElement) => [
      image.naturalWidth,
      image.naturalHeight,
    ]),
  ).toEqual(sourceSize);
  await expect(
    page.getByText(`Camera feed: ${sourceSize[0]} × ${sourceSize[1]} px`, {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Retake photo 2", exact: true })
    .click();
  await page.getByRole("button", { name: "Retake this photo" }).click();
  await expect(
    page.getByRole("button", { name: "Make it yours" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Make it yours" }).click();
  await expect(page.locator(".composed-preview canvas")).toBeVisible();
  await page.getByRole("button", { name: "Midnight frame" }).click();
  await page.getByRole("button", { name: "B&W", exact: true }).click();
  await page.getByLabel("Caption", { exact: true }).fill("We were here.");
  await page
    .getByRole("button", { name: "Save a draft on this device" })
    .click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  await page.getByRole("button", { name: "This is the one" }).click();
  await expect(page.getByRole("link", { name: /Download video/ })).toHaveCount(
    0,
  );
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PNG" }).click();
  const download = await downloadPromise;
  const buffer = await readFile((await download.path())!);
  expect(buffer.subarray(1, 4).toString()).toBe("PNG");
  expect(buffer.readUInt32BE(16)).toBe(600);
  expect(buffer.readUInt32BE(20)).toBe(1800);
  expect(buffer.length).toBeGreaterThan(10000);
  await page.screenshot({
    path: "test-results/result-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("optional countdown videos record real silent clips and capture stills at zero", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.getByText("Ready for offline memories")).toBeVisible({
    timeout: 15000,
  });
  await page.reload();
  await context.setOffline(true);
  await page.goto("/setup");
  await page.getByRole("button", { name: "2 shots" }).click();
  await page.getByRole("button", { name: "Open my booth" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Live photo · save countdown videos" }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Enable camera", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Live photo · save countdown videos" })
    .check();
  await page.getByRole("button", { name: "Let’s take some photos" }).click();
  await expect(
    page.getByText("RECORDING CLIP · MIRRORED", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Make it yours" })).toBeVisible(
    { timeout: 20000 },
  );
  await expect(
    page.getByRole("button", { name: /Retake photo/ }).locator("img"),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Make it yours" }).click();
  await page.getByRole("button", { name: "Cherry frame" }).click();
  await page.getByLabel("Caption", { exact: true }).fill("Our video memory");
  await page.getByRole("button", { name: "This is the one" }).click();
  await page
    .getByRole("button", { name: "Create framed video", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Cancel export" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel export" }).click();
  await page
    .getByRole("button", { name: "Create framed video", exact: true })
    .click();
  const framed = page.getByLabel("Framed video preview");
  await expect(framed).toBeVisible({ timeout: 20000 });
  await expect
    .poll(() => framed.evaluate((video: HTMLVideoElement) => video.readyState))
    .toBeGreaterThanOrEqual(2);
  expect(
    await framed.evaluate((video: HTMLVideoElement) => [
      video.videoWidth,
      video.videoHeight,
    ]),
  ).toEqual([600, 1800]);
  const border = await framed.evaluate((video: HTMLVideoElement) => {
    const c = document.createElement("canvas");
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    const context = c.getContext("2d")!;
    context.drawImage(video, 0, 0);
    return Array.from(context.getImageData(5, 5, 1, 1).data).slice(0, 3);
  });
  [157, 56, 83].forEach((value, i) =>
    expect(Math.abs(border[i] - value)).toBeLessThan(15),
  );
  await framed.evaluate(
    (video: HTMLVideoElement) =>
      new Promise<void>((resolve, reject) => {
        video.onended = () => resolve();
        video.onerror = () =>
          reject(new Error("Could not play framed export."));
        void video.play().catch(reject);
      }),
  );
  const stillPixel = await page
    .locator(".composed-preview canvas")
    .evaluate((canvas: HTMLCanvasElement) =>
      Array.from(
        canvas.getContext("2d")!.getImageData(300, 300, 1, 1).data,
      ).slice(0, 3),
    );
  const endPixel = await framed.evaluate((video: HTMLVideoElement) => {
    const c = document.createElement("canvas");
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    const context = c.getContext("2d")!;
    context.drawImage(video, 0, 0);
    return Array.from(context.getImageData(300, 300, 1, 1).data).slice(0, 3);
  });
  stillPixel.forEach((value, i) =>
    expect(Math.abs(endPixel[i] - value)).toBeLessThan(20),
  );
  const framedDownload = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Download framed video", exact: true })
    .click();
  expect((await framedDownload).suggestedFilename()).toMatch(
    /^snappie-framed-strip\.(mp4|webm)$/,
  );
  await page.getByLabel("Output size").selectOption("story");
  await expect(
    page.getByRole("link", { name: "Download framed video", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Create framed video", exact: true })
    .click();
  await expect(framed).toBeVisible({ timeout: 20000 });
  await expect
    .poll(() => framed.evaluate((video: HTMLVideoElement) => video.videoWidth))
    .toBe(1080);
  expect(
    await framed.evaluate((video: HTMLVideoElement) => video.videoHeight),
  ).toBe(1920);
  await page
    .getByText("Individual camera clips (without frame)", { exact: true })
    .click();
  await expect(page.getByRole("link", { name: /Download video/ })).toHaveCount(
    2,
  );
  const clip = page.getByLabel("Countdown video 1");
  await clip.evaluate(async (v: HTMLVideoElement) => v.play());
  await expect
    .poll(() => clip.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(0.25);
  await clip.evaluate((v: HTMLVideoElement) => v.pause());
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Download video 1", exact: true })
    .click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(
    /^snappie-countdown-1\.(webm|mp4)$/,
  );
  expect((await readFile((await download.path())!)).length).toBeGreaterThan(
    1000,
  );
  const still = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PNG" }).click();
  expect((await still).suggestedFilename()).toMatch(/\.png$/);
  await page.screenshot({
    path: "test-results/countdown-video-result.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Make another memory" }).click();
  await page.getByRole("button", { name: "Open my booth" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Live photo · save countdown videos" }),
  ).not.toBeChecked();
  await context.setOffline(false);
});
test("story export has 1080 × 1920 pixels and device sharing sends the composed file", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        const f = data.files![0];
        const bytes = await f.arrayBuffer();
        (window as unknown as { shared: unknown }).shared = {
          type: f.type,
          name: f.name,
          width: new DataView(bytes).getUint32(16),
          height: new DataView(bytes).getUint32(20),
        };
      },
    });
  });
  await captureFour(page);
  await page.getByRole("button", { name: "Make it yours" }).click();
  await page
    .getByRole("combobox", { name: "Layout", exact: true })
    .selectOption("story");
  await page.getByRole("button", { name: "This is the one" }).click();
  await expect(page.getByLabel("Output size")).toHaveValue("story");
  await expect(page.locator(".composed-preview canvas")).toHaveJSProperty(
    "width",
    1080,
  );
  await expect(page.locator(".composed-preview canvas")).toHaveJSProperty(
    "height",
    1920,
  );
  await expect(
    page.getByRole("button", { name: "Print your keepsake" }),
  ).not.toBeVisible();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PNG" }).click();
  const png = await readFile((await (await downloaded).path())!);
  expect(png.readUInt32BE(16)).toBe(1080);
  expect(png.readUInt32BE(20)).toBe(1920);
  const jpgDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JPG" }).click();
  const jpg = await readFile((await (await jpgDownload).path())!);
  expect(jpg.readUInt16BE(0)).toBe(0xffd8);
  const jpgSize = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/jpeg;base64,${base64}`;
    await image.decode();
    return [image.naturalWidth, image.naturalHeight];
  }, jpg.toString("base64"));
  expect(jpgSize).toEqual([1080, 1920]);
  await expect(page.getByRole("button", { name: "Share image" })).toBeEnabled();
  await page.getByRole("button", { name: "Share image" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { shared: unknown }).shared),
    )
    .toEqual({
      type: "image/png",
      name: "snappie-story.png",
      width: 1080,
      height: 1920,
    });
  await page.evaluate(() =>
    Object.defineProperty(navigator, "canShare", { value: () => false }),
  );
  await page.getByRole("button", { name: "Share image" }).click();
  await expect(page.getByRole("status")).toContainText(
    "File sharing isn’t supported here",
  );
  await page.screenshot({
    path: "test-results/story-desktop.png",
    fullPage: true,
  });
});
test("cached application can reload, capture four photos, and download offline", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.getByText("Ready for offline memories")).toBeVisible({
    timeout: 15000,
  });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await captureFour(page);
  await expect(page.getByText(/You’re offline/)).toBeVisible();
  await page.getByRole("button", { name: "Make it yours" }).click();
  await page.getByRole("button", { name: "This is the one" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PNG" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.png$/);
  await context.setOffline(false);
});
test("kiosk setup is PIN protected and offers a printable 4x6 result", async ({
  page,
}) => {
  await page.goto("/kiosk/settings");
  await page.getByLabel("Choose your admin PIN").fill("4826");
  await page.getByRole("button", { name: "Save PIN" }).click();
  await page.getByLabel("Event name").fill("A night to remember");
  await page.getByLabel("Print layout").selectOption("postcard");
  await page.getByRole("link", { name: /Ready for the good times/ }).click();
  await page.getByRole("button", { name: /Tap to make a memory/ }).click();
  await page
    .getByRole("button", { name: "Enable camera", exact: true })
    .click();
  await page.getByRole("button", { name: "Let’s take some photos" }).click();
  await page
    .getByRole("button", { name: "Make it yours" })
    .click({ timeout: 25000 });
  await expect(
    page.getByRole("button", { name: "Save a draft on this device" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Delete saved draft" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "This is the one" }).click();
  await expect(page.locator(".composed-preview canvas")).toHaveJSProperty(
    "width",
    1800,
  );
  await expect(page.locator(".composed-preview canvas")).toHaveJSProperty(
    "height",
    1200,
  );
  await page.evaluate(() => {
    window.addEventListener("beforeprint", () => {
      document.body.dataset.printed = "yes";
    });
  });
  await page.getByRole("button", { name: "Print your keepsake" }).click();
  await expect(page.locator('iframe[title="Snappie print"]')).toBeAttached();
  await page.goto("/kiosk/settings");
  await expect(page.getByLabel("Admin PIN", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Event name")).not.toBeVisible();
});
test("camera denial has a recovery path and unavailable online infrastructure is honest", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
  });
  await page.goto("/capture");
  await page
    .getByRole("button", { name: "Enable camera", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Camera permission was declined",
  );
  await expect(
    page.getByRole("button", { name: "Try camera again" }),
  ).toBeVisible();
  await page.goto("/together");
  await expect(
    page.getByText("The online booth needs a connection setup."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create a private room" }),
  ).toBeDisabled();
});
test("landing and setup fit a narrow mobile display", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Little moments/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  const headline = page.getByRole("heading", { name: /Little moments/ });
  expect(
    await headline.evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/home-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Step into the booth", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Open my booth" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("verified photo transport runs over real WebRTC data channels", async ({
  page,
}) => {
  const source = await readFile("src/services/webrtc/transfer.ts", "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
  }).outputText;
  await page.route("**/__tests/transfer.js", (route) =>
    route.fulfill({ contentType: "application/javascript", body: js }),
  );
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const moduleUrl = "/__tests/transfer.js";
    const { PhotoTransport } = await import(moduleUrl);
    const a = new RTCPeerConnection({ iceServers: [] }),
      b = new RTCPeerConnection({ iceServers: [] });
    const queuedA: RTCIceCandidateInit[] = [],
      queuedB: RTCIceCandidateInit[] = [];
    a.onicecandidate = (e) => {
      if (e.candidate) {
        if (b.remoteDescription) void b.addIceCandidate(e.candidate);
        else queuedB.push(e.candidate.toJSON());
      }
    };
    b.onicecandidate = (e) => {
      if (e.candidate) {
        if (a.remoteDescription) void a.addIceCandidate(e.candidate);
        else queuedA.push(e.candidate.toJSON());
      }
    };
    const outgoing = a.createDataChannel("test", { ordered: true });
    const incoming = new Promise<RTCDataChannel>(
      (res) => (b.ondatachannel = (e) => res(e.channel)),
    );
    await a.setLocalDescription(await a.createOffer());
    await b.setRemoteDescription(a.localDescription!);
    for (const c of queuedB) await b.addIceCandidate(c);
    await b.setLocalDescription(await b.createAnswer());
    await a.setRemoteDescription(b.localDescription!);
    for (const c of queuedA) await a.addIceCandidate(c);
    const other = await incoming;
    await Promise.all(
      [outgoing, other].map((c) =>
        c.readyState === "open"
          ? Promise.resolve()
          : new Promise<void>((res) => (c.onopen = () => res())),
      ),
    );
    let photo = "",
      error = "";
    const sender = new PhotoTransport(
      outgoing,
      () => {},
      (e: Error) => (error = e.message),
    );
    const receiver = new PhotoTransport(
      other,
      (_id: string, data: string) => (photo = data),
      (e: Error) => (error = e.message),
    );
    outgoing.onmessage = (e) => void sender.receive(JSON.parse(e.data));
    other.onmessage = (e) => void receiver.receive(JSON.parse(e.data));
    const data = "data:image/jpeg;base64," + "A".repeat(75000);
    await sender.sendPhoto("real-peer-shot", data);
    const result = {
      matched: photo === data,
      error,
      connection: a.connectionState,
    };
    sender.dispose();
    receiver.dispose();
    a.close();
    b.close();
    return result;
  });
  expect(result).toEqual({ matched: true, error: "", connection: "connected" });
  await page.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
