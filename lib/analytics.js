export function trackEvent(name, params = {}) {
  if (
    typeof process !== "undefined" &&
    process.env &&
    process.env.NODE_ENV === "development"
  ) {
    console.log("[analytics] trackEvent", name, params);
  }

  if (typeof window === "undefined") return;
  if (typeof window.gtag !== "function") return;

  try {
    window.gtag("event", name, params);
  } catch (_) {
    /* analytics must not break gameplay */
  }
}
