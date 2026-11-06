import type { EditorSettings } from "../../types";
import { dimensions, drawComposition, imageFrom } from "./compose";
import { canRecordMotion } from "../capture/motionClip";

const cancelled = () =>
  new DOMException("Framed video cancelled.", "AbortError");
export async function composeFramedVideo(
  photos: string[],
  clips: (Blob | null)[],
  settings: EditorSettings,
  logo: string,
  countdown: number,
  signal: AbortSignal,
  onProgress: (progress: number) => void,
): Promise<Blob> {
  if (!canRecordMotion())
    throw new Error(
      "Video export is unavailable in this browser. Your photo download is still available.",
    );
  if (!photos.length || !clips.some(Boolean))
    throw new Error("Record countdown videos before creating a framed video.");
  const videos: HTMLVideoElement[] = [],
    urls: string[] = [];
  const check = () => {
    if (signal.aborted) throw cancelled();
  };
  try {
    check();
    const images = await Promise.all(photos.map(imageFrom));
    const logoImage = logo ? await imageFrom(logo) : undefined;
    check();
    const media = await Promise.all(
      photos.map(async (_, i) => {
        if (!clips[i]) return null;
        const url = URL.createObjectURL(clips[i]!);
        urls.push(url);
        const video = document.createElement("video");
        videos.push(video);
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";
        await new Promise<void>((resolve, reject) => {
          const clean = () => {
            clearTimeout(timeout);
            video.removeEventListener("loadeddata", loaded);
            video.removeEventListener("error", failed);
            signal.removeEventListener("abort", abort);
          };
          const loaded = () => {
              clean();
              resolve();
            },
            failed = () => {
              clean();
              reject(
                new Error(
                  "A countdown clip could not be opened. You can still download the original clips.",
                ),
              );
            },
            abort = () => {
              clean();
              reject(cancelled());
            };
          const timeout = setTimeout(failed, 10000);
          video.addEventListener("loadeddata", loaded, { once: true });
          video.addEventListener("error", failed, { once: true });
          signal.addEventListener("abort", abort, { once: true });
          if (signal.aborted) {
            abort();
            return;
          }
          video.src = url;
          video.load();
        });
        return video;
      }),
    );
    check();
    const canvas = document.createElement("canvas");
    const size = dimensions(settings.template);
    canvas.width = size.width;
    canvas.height = size.height;
    // Common browser video codecs do not preserve alpha. PNG export remains transparent.
    const videoSettings =
      settings.frame === "transparent"
        ? { ...settings, frame: "#fff8e9" }
        : settings;
    const paint = (still = false) =>
      drawComposition(
        canvas,
        images.map((image, i) => {
          const video = media[i];
          return !still && video && video.readyState >= 2
            ? {
                image: video,
                width: video.videoWidth,
                height: video.videoHeight,
              }
            : { image, width: image.width, height: image.height };
        }),
        videoSettings,
        logoImage,
      );
    paint();
    await Promise.all(videos.map((v) => v.play()));
    check();
    const duration = Math.min(
      10,
      Math.max(
        1,
        ...videos.map((v) =>
          Number.isFinite(v.duration) && v.duration > 0
            ? v.duration
            : countdown,
        ),
      ),
    );
    const stream = canvas.captureStream(24);
    let recorder: MediaRecorder;
    try {
      const mimeType = [
        "video/mp4",
        "video/webm;codecs=vp8",
        "video/webm",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 8_000_000,
      });
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      throw e;
    }
    return await new Promise<Blob>((resolve, reject) => {
      const chunks: Blob[] = [];
      let frame = 0,
        done = false,
        bytes = 0,
        start = 0;
      const cleanup = () => {
        cancelAnimationFrame(frame);
        clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
        stream.getTracks().forEach((t) => t.stop());
        chunks.length = 0;
      };
      const fail = (error: Error) => {
        if (done) return;
        done = true;
        try {
          if (recorder.state !== "inactive") recorder.stop();
        } catch {
          /* Encoder already stopped. */
        }
        cleanup();
        reject(error);
      };
      const abort = () => fail(cancelled());
      const timeout = setTimeout(
        () =>
          fail(
            new Error(
              "Video export took too long. Keep this tab visible and try again.",
            ),
          ),
        (duration + 12) * 1000,
      );
      recorder.ondataavailable = (e) => {
        if (done || !e.data.size) return;
        bytes += e.data.size;
        if (bytes > 32_000_000) {
          fail(new Error("Framed video exceeded the export size limit."));
          return;
        }
        chunks.push(e.data);
      };
      recorder.onerror = () =>
        fail(
          new Error(
            "The browser could not encode this framed video. Original clips and still photos are still available.",
          ),
        );
      recorder.onstop = () => {
        if (done) return;
        if (!chunks.length) {
          fail(new Error("The framed video was empty. Please try again."));
          return;
        }
        const blob = new Blob(chunks, {
          type: recorder.mimeType || chunks[0].type || "video/webm",
        });
        done = true;
        cleanup();
        onProgress(1);
        resolve(blob);
      };
      const render = () => {
        if (done) return;
        try {
          const elapsed = (performance.now() - start) / 1000;
          paint(elapsed >= duration);
          onProgress(Math.min(1, elapsed / (duration + 1)));
          if (elapsed >= duration + 1) {
            recorder.stop();
            return;
          }
          frame = requestAnimationFrame(render);
        } catch (e) {
          fail(e instanceof Error ? e : new Error("Video composition failed."));
        }
      };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) {
        abort();
        return;
      }
      try {
        recorder.start(250);
        // Feed the canvas immediately: some encoders wait for a fresh frame before emitting 'start'.
        start = performance.now();
        render();
      } catch (e) {
        fail(
          e instanceof Error
            ? e
            : new Error("Could not start framed video export."),
        );
      }
    });
  } finally {
    for (const video of videos) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    for (const url of urls) URL.revokeObjectURL(url);
  }
}
