export {};

declare global {
  interface Window {
    gtag?: (
      command: "event" | "config" | "js",
      eventNameOrDate: string | Date,
      params?: Record<string, unknown>
    ) => void;
  }
}
