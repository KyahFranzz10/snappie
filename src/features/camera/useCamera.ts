import { useCallback, useEffect, useRef, useState } from "react";
import { captureFrame, type CaptureOptions } from "./captureFrame";
export function useCamera({
  width = 3840,
  height = 2160,
}: { width?: number; height?: number } = {}) {
  const video = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [resolution, setResolution] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [selectedDevice, setSelectedDevice] = useState("");
  const stop = useCallback(() => {
    generation.current++;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    setResolution(null);
    setBusy(false);
    setReady(false);
  }, []);
  const start = useCallback(
    async (deviceId?: string) => {
      const token = ++generation.current;
      setBusy(true);
      setError("");
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setStream(null);
      setResolution(null);
      setReady(false);
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error(
            "Camera access requires HTTPS or localhost and a supported browser.",
          );
        const videoConstraints: MediaTrackConstraints & {
          resizeMode?: string;
        } = {
          width: { ideal: width, max: width },
          height: { ideal: height, max: height },
          frameRate: { ideal: 24, max: 30 },
          resizeMode: "none",
          ...(deviceId
            ? { deviceId: { exact: deviceId } }
            : { facingMode: "user" }),
        };
        const s = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: videoConstraints,
        });
        if (token !== generation.current) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = s;
        setStream(s);
        const settings = s.getVideoTracks()[0].getSettings();
        setSelectedDevice(settings.deviceId || deviceId || "");
        setDevices(
          (await navigator.mediaDevices.enumerateDevices()).filter(
            (d) => d.kind === "videoinput",
          ),
        );
        s.getVideoTracks()[0].onended = () => {
          setError("Your camera disconnected. Reconnect it and try again.");
          setStream(null);
          setResolution(null);
          setReady(false);
        };
      } catch (e) {
        if (token !== generation.current) return;
        const name = e instanceof DOMException ? e.name : "";
        setError(
          name === "NotAllowedError"
            ? "Camera permission was declined. Allow camera access in your browser settings, then try again."
            : name === "NotFoundError"
              ? "No camera found. Connect a camera and try again."
              : name === "NotReadableError"
                ? "Your camera is busy. Close other camera apps and try again."
                : e instanceof Error
                  ? e.message
                  : "Could not open your camera.",
        );
      } finally {
        if (token === generation.current) setBusy(false);
      }
    },
    [width, height],
  );
  useEffect(() => {
    if (video.current) {
      const element = video.current;
      let active = true;
      const update = () => {
        if (!active) return;
        setReady(
          !!streamRef.current &&
            element.readyState >= 2 &&
            element.videoWidth > 0,
        );
        if (element.videoWidth && element.videoHeight)
          setResolution({
            width: element.videoWidth,
            height: element.videoHeight,
          });
      };
      element.addEventListener("loadedmetadata", update);
      element.addEventListener("loadeddata", update);
      element.addEventListener("playing", update);
      element.addEventListener("resize", update);
      element.srcObject = stream;
      void element
        .play()
        .then(update)
        .catch(() => {});
      return () => {
        active = false;
        element.removeEventListener("loadedmetadata", update);
        element.removeEventListener("loadeddata", update);
        element.removeEventListener("playing", update);
        element.removeEventListener("resize", update);
      };
    }
  }, [stream]);
  useEffect(
    () => () => {
      generation.current++;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  const capture = useCallback((options?: CaptureOptions) => {
    const v = video.current;
    if (
      !v ||
      !v.videoWidth ||
      !streamRef.current
        ?.getVideoTracks()
        .some((t) => t.readyState === "live" && t.enabled)
    )
      throw new Error("Your camera is not ready. Turn it on and try again.");
    return captureFrame(v, options);
  }, []);
  return {
    video,
    stream,
    error,
    devices,
    busy,
    ready,
    start,
    stop,
    capture,
    resolution,
    selectedDevice,
  };
}
