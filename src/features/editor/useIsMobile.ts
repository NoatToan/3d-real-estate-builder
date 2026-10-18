"use client";

import { useSyncExternalStore } from "react";

/** Below Tailwind's `md` (768 px): phones and small tablets in portrait. */
export const MOBILE_QUERY = "(max-width: 767px)";

function subscribe(cb: () => void) {
  const m = window.matchMedia(MOBILE_QUERY);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}

/** True on small screens: tools move to a bottom bar, the control panel becomes a bottom sheet. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
}
