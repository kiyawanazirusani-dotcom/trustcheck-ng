// Shared online/offline subscription for useSyncExternalStore. Pure-ish: the
// subscribe/getSnapshot functions touch window/navigator but are only invoked
// by React on the client (getServerSnapshot is used during SSR).

export function subscribeOnline(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function getOnlineSnapshot(): boolean {
  return navigator.onLine;
}

// During SSR and initial hydration assume online (no banner → no mismatch).
export function getOnlineServerSnapshot(): boolean {
  return true;
}
