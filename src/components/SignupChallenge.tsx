import { useEffect, useRef, useState } from "react";

type Turnstile = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  remove: (id: string) => void;
};

let loading: Promise<Turnstile> | undefined;

function loadTurnstile() {
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => {
      const api = (window as Window & { turnstile?: Turnstile }).turnstile;
      if (api) resolve(api);
      else reject(new Error("Verification unavailable."));
    };
    script.onerror = () => reject(new Error("Verification unavailable."));
    document.head.append(script);
  });
  return loading;
}

export function SignupChallenge({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (token: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    let active = true;
    void loadTurnstile()
      .then((api) => {
        if (!active || !container.current) return;
        const id = api.render(container.current, {
          sitekey: siteKey,
          callback: (token) => {
            setFailed(false);
            onToken(token);
          },
          "expired-callback": () => onToken(""),
          "error-callback": () => {
            onToken("");
            setFailed(true);
          },
        });
        dispose = () => api.remove(id);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      dispose?.();
    };
  }, [siteKey, onToken]);

  return (
    <>
      <div ref={container} />
      {failed && <p role="alert">Verification failed. Reload to try again.</p>}
    </>
  );
}
