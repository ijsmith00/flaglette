export function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(dateString) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateString || "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, monthIndex, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== monthIndex ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
}

export function daysBetween(date1, date2) {
  const d1 = parseLocalDate(date1);
  const d2 = parseLocalDate(date2);
  if (!d1 || !d2) return 0;
  const start = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate()).getTime();
  const end = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate()).getTime();
  return Math.round((end - start) / 86400000);
}

export function isYesterday(prevDate, today) {
  return daysBetween(prevDate, today) === 1;
}

export function msUntilMidnight() {
  const now = new Date();
  const next = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
    0
  );
  return Math.max(0, next.getTime() - now.getTime());
}

export function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )}:${String(seconds).padStart(2, "0")}`;
}
