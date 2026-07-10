import { useEffect } from "react";

/**
 * Hold a screen wake lock while `active`, so the phone doesn't sleep
 * mid-quarter. Re-acquires when the tab becomes visible again (the browser
 * releases the lock on tab switch / screen off) and releases on cleanup.
 * A denied or unsupported wake lock is fine — coding just proceeds without.
 */
export function useScreenWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let stopped = false;

    async function acquire() {
      try {
        const acquired = await navigator.wakeLock.request("screen");
        if (stopped) {
          void acquired.release();
        } else {
          sentinel = acquired;
        }
      } catch {
        // Denied (e.g. low battery) or unavailable — not fatal.
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") void acquire();
    }

    void acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void sentinel?.release();
    };
  }, [active]);
}
