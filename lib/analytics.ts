export type EventName =
  | "game_started"
  | "game_completed"
  | "hint_revealed"
  | "practice_completed"
  | "streak_milestone"
  | "stats_modal_opened"
  | "share_clicked";

export type EventParams = Record<string, unknown>;

export function trackEvent(name: EventName, params?: EventParams): void {
  const payload = params ?? {};

  if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
    // Dev verification hook; avoids silently losing event wiring during local work.
    console.log("[analytics] trackEvent", name, payload);
  }

  if (typeof window === "undefined") return;
  if (typeof window.gtag !== "function") return;

  try {
    window.gtag("event", name, payload);
  } catch {
    // analytics must never break gameplay UI
  }
}
