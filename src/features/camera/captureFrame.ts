export interface CaptureOptions {
  format?: "png" | "jpeg";
  maxDimension?: number;
}

// Preserve the source frame. Cropping belongs to the selected print/story template.
export function captureFrame(
  video: HTMLVideoElement,
  options: CaptureOptions = {},
) {
  if (!video.videoWidth || !video.videoHeight || video.readyState < 2)
    throw new Error(
      "Your camera is still getting ready. Wait a moment and try again.",
    );
  const scale = options.maxDimension
    ? Math.min(
        1,
        options.maxDimension / Math.max(video.videoWidth, video.videoHeight),
      )
    : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("Photo capture is unavailable in this browser.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.translate(canvas.width, 0);
  context.scale(-1, 1);
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return options.format === "jpeg"
    ? canvas.toDataURL("image/jpeg", 0.98)
    : canvas.toDataURL("image/png");
}
