import { useEffect, useState } from "react";
export function useOnline() {
  const [online, set] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => set(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}
