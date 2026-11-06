export interface MotionClipRecorder {
  finish: () => Promise<Blob>;
  cancel: () => void;
}

export function canRecordMotion() {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function"
  );
}

// Record a bounded, mirrored, silent canvas stream. Never stop the source webcam.
export function startMotionClip(video: HTMLVideoElement): MotionClipRecorder {
  if (!canRecordMotion())
    throw new Error(
      "Countdown video recording is not supported by this browser.",
    );
  if (!video.videoWidth || !video.videoHeight || video.readyState < 2)
    throw new Error("Wait for the camera preview before recording.");
  const canvas = document.createElement("canvas");
  const scale = Math.min(
    1,
    1280 / Math.max(video.videoWidth, video.videoHeight),
  );
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Video recording is unavailable.");
  context.imageSmoothingQuality = "high";
  const draw = () => {
    context.setTransform(-1, 0, 0, 1, canvas.width, 0);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
  };
  draw();
  const stream = canvas.captureStream(24);
  const mimeType = [
    "video/mp4;codecs=avc1.42E01E",
    "video/mp4",
    "video/webm;codecs=vp8",
    "video/webm",
  ].find((t) => MediaRecorder.isTypeSupported(t));
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 4_000_000,
    });
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    throw e;
  }
  let frame = 0,
    bytes = 0,
    settled = false,
    finishing = false;
  let resolve!: (blob: Blob) => void, reject!: (error: Error) => void;
  const chunks: Blob[] = [];
  const result = new Promise<Blob>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  void result.catch(() => {});
  const cleanup = () => {
    cancelAnimationFrame(frame);
    clearTimeout(timeout);
    stream.getTracks().forEach((t) => t.stop());
    chunks.length = 0;
  };
  const fail = (error: Error) => {
    if (settled) return;
    settled = true;
    if (recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        /* Always release recording tracks, even after encoder failure. */
      }
    }
    cleanup();
    reject(error);
  };
  const timeout = setTimeout(
    () =>
      fail(
        new Error(
          "Countdown video recording timed out. Your still photos can still be kept.",
        ),
      ),
    15000,
  );
  recorder.ondataavailable = (e) => {
    if (settled || !e.data.size) return;
    bytes += e.data.size;
    if (bytes > 12_000_000) {
      fail(new Error("This countdown video exceeded the recording limit."));
      return;
    }
    chunks.push(e.data);
  };
  recorder.onerror = () =>
    fail(
      new Error("Video recording failed. Your still photos can still be kept."),
    );
  recorder.onstop = () => {
    if (settled) return;
    if (!finishing || !chunks.length) {
      fail(new Error("No countdown video was recorded."));
      return;
    }
    const blob = new Blob(chunks, {
      type: recorder.mimeType || chunks[0].type || "video/webm",
    });
    settled = true;
    cleanup();
    resolve(blob);
  };
  const animate = () => {
    if (settled || finishing) return;
    try {
      draw();
      frame = requestAnimationFrame(animate);
    } catch {
      fail(new Error("The video preview was interrupted."));
    }
  };
  try {
    recorder.start(250);
    frame = requestAnimationFrame(animate);
  } catch (e) {
    fail(
      e instanceof Error ? e : new Error("Could not start video recording."),
    );
    throw e;
  }
  return {
    finish: () => {
      if (!settled && !finishing) {
        finishing = true;
        cancelAnimationFrame(frame);
        if (recorder.state !== "inactive") {
          try {
            recorder.stop();
          } catch {
            fail(new Error("Could not finish this countdown video."));
          }
        }
      }
      return result;
    },
    cancel: () =>
      fail(new DOMException("Countdown video cancelled.", "AbortError")),
  };
}
