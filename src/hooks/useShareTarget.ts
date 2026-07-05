import { useEffect, useState } from "react";

// Handles content received via the PWA Share Target (Android Share Sheet)
export function useShareTarget() {
  const [sharedText, setSharedText] = useState<string>("");
  const [isSharedActive, setIsSharedActive] = useState<boolean>(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const title = params.get("title") || "";
    const text = params.get("text") || "";
    const url = params.get("url") || "";
    const fullShared = [title, text, url].filter(Boolean).join(" ");

    if (fullShared) {
      setSharedText(fullShared.trim());
      setIsSharedActive(true);
      // Clean up URL params so reloading doesn't prompt again
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const dismiss = () => setIsSharedActive(false);
  const clear = () => {
    setIsSharedActive(false);
    setSharedText("");
  };

  return { sharedText, isSharedActive, dismiss, clear };
}
