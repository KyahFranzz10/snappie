import { useEffect, useState } from "react";
export function useOffline() {
  const [ready, setReady] = useState(false);
  const [refresh, setRefresh] = useState(false);
  const [registration, setRegistration] =
    useState<ServiceWorkerRegistration | null>(null);
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let active = true;
    void navigator.serviceWorker
      .register("/sw.js")
      .then((r) => {
        if (!active) return;
        setRegistration(r);
        if (r.active) setReady(true);
        if (r.waiting) setRefresh(true);
        r.addEventListener("updatefound", () => {
          const worker = r.installing;
          if (worker)
            worker.addEventListener("statechange", () => {
              if (worker.state === "installed" && active) {
                if (navigator.serviceWorker.controller) setRefresh(true);
                else setReady(true);
              }
            });
        });
        void navigator.serviceWorker.ready.then(() => {
          if (active) setReady(true);
        });
      })
      .catch(() => {
        /* Offline readiness is shown only when caching actually succeeds. */
      });
    return () => {
      active = false;
    };
  }, []);
  function update() {
    if (!registration?.waiting) return;
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => location.reload(),
      { once: true },
    );
    registration.waiting.postMessage("ACTIVATE_UPDATE");
  }
  return { ready, refresh, update };
}
