import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useBooth } from "../stores/booth";
// Return an abandoned capture/editor to the attract screen and release its camera.
export function useKioskIdle() {
  const mode = useBooth((s) => s.mode),
    reset = useBooth((s) => s.reset);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (mode !== "kiosk" || !["/capture", "/editor"].includes(pathname)) return;
    let timer: ReturnType<typeof setTimeout>;
    const touch = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        reset();
        navigate("/kiosk", { replace: true });
      }, 120000);
    };
    touch();
    window.addEventListener("pointerdown", touch);
    window.addEventListener("keydown", touch);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
    };
  }, [mode, pathname, navigate, reset]);
}
