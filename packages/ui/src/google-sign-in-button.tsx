import { useEffect, useRef } from "react";

const GIS_SRC = "https://accounts.google.com/gsi/client";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
            cancel_on_tap_outside?: boolean;
            use_fedcm_for_button?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: { theme: string; size: string; text: string; width: number },
          ) => void;
        };
      };
    };
  }
}

export function GoogleSignInButton({
  clientId,
  disabled,
  onCredential,
}: {
  clientId: string;
  disabled?: boolean;
  onCredential: (idToken: string) => void;
}) {
  const slot = useRef<HTMLDivElement>(null);
  const onCredentialRef = useRef(onCredential);
  const renderedFor = useRef("");
  onCredentialRef.current = onCredential;

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    function render() {
      const el = slot.current;
      const gis = window.google?.accounts.id;
      if (!el || !gis || cancelled) return;
      if (renderedFor.current === clientId && el.childElementCount > 0) return;
      el.replaceChildren();
      gis.initialize({
        client_id: clientId,
        cancel_on_tap_outside: true,
        use_fedcm_for_button: true,
        callback: (response) => {
          if (response.credential) onCredentialRef.current(response.credential);
        },
      });
      gis.renderButton(el, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        width: 320,
      });
      renderedFor.current = clientId;
    }

    if (window.google?.accounts.id) {
      render();
      return () => {
        cancelled = true;
      };
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GIS_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener("load", render);
      return () => {
        cancelled = true;
        existing.removeEventListener("load", render);
      };
    }

    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return (
    <div
      ref={slot}
      className={disabled ? "pointer-events-none flex justify-center opacity-60" : "flex justify-center"}
      data-testid="google-gis-button"
    />
  );
}
