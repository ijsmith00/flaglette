import { daysBetween, getLocalDateString, isYesterday } from "../utils/date.js";

const STORAGE_KEY = "flaglette.stats.v1";
const SCHEMA_VERSION = 1;
const MILESTONES = [7, 30, 100];
const HISTORY_LIMIT_DAYS = 60;

export const DEFAULT_STATS = {
  schemaVersion: SCHEMA_VERSION,
  currentStreak: 0,
  maxStreak: 0,
  lastPlayedDate: null,
  totalPlayed: 0,
  totalWon: 0,
  guessDistribution: [0, 0, 0, 0, 0, 0, 0],
  history: [],
  firstPlayedDate: null,
  shareCount: 0,
};

function cloneDefaultStats() {
  return {
    ...DEFAULT_STATS,
    guessDistribution: [...DEFAULT_STATS.guessDistribution],
    history: [],
  };
}

function sanitizeStats(input) {
  if (typeof input !== "object" || input === null) {
    return cloneDefaultStats();
  }
  const raw = input;
  const normalized = cloneDefaultStats();
  normalized.currentStreak = Number.isFinite(raw.currentStreak)
    ? Math.max(0, Math.floor(raw.currentStreak))
    : 0;
  normalized.maxStreak = Number.isFinite(raw.maxStreak)
    ? Math.max(0, Math.floor(raw.maxStreak))
    : 0;
  normalized.lastPlayedDate =
    typeof raw.lastPlayedDate === "string" ? raw.lastPlayedDate : null;
  normalized.totalPlayed = Number.isFinite(raw.totalPlayed)
    ? Math.max(0, Math.floor(raw.totalPlayed))
    : 0;
  normalized.totalWon = Number.isFinite(raw.totalWon)
    ? Math.max(0, Math.floor(raw.totalWon))
    : 0;
  if (Array.isArray(raw.guessDistribution) && raw.guessDistribution.length === 7) {
    normalized.guessDistribution = raw.guessDistribution.map((n) =>
      Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
    );
  }
  if (Array.isArray(raw.history)) {
    normalized.history = raw.history
      .map((entry) => {
        if (typeof entry !== "object" || entry === null) return null;
        if (
          typeof entry.date !== "string" ||
          typeof entry.won !== "boolean" ||
          !Number.isFinite(entry.guesses) ||
          typeof entry.countryCode !== "string" ||
          !Number.isFinite(entry.hintsUsed)
        ) {
          return null;
        }
        return {
          date: entry.date,
          won: entry.won,
          guesses: Math.max(1, Math.floor(entry.guesses)),
          countryCode: entry.countryCode,
          hintsUsed: Math.max(0, Math.floor(entry.hintsUsed)),
        };
      })
      .filter((entry) => entry !== null);
  }
  normalized.firstPlayedDate =
    typeof raw.firstPlayedDate === "string" ? raw.firstPlayedDate : null;
  normalized.shareCount = Number.isFinite(raw.shareCount)
    ? Math.max(0, Math.floor(raw.shareCount))
    : 0;
  if (normalized.maxStreak < normalized.currentStreak) {
    normalized.maxStreak = normalized.currentStreak;
  }
  normalized.schemaVersion = SCHEMA_VERSION;
  return normalized;
}

export function loadStats() {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return cloneDefaultStats();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefaultStats();
    return sanitizeStats(JSON.parse(raw));
  } catch {
    return cloneDefaultStats();
  }
}

export function saveStats(stats) {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeStats(stats)));
  } catch {
    /* ignore */
  }
}

function getGuessDistributionIndex(won, guesses) {
  if (!won) return 6;
  return Math.min(6, Math.max(1, Math.floor(guesses))) - 1;
}

function trimHistoryToRecentDays(history, today) {
  return history.filter((entry) => {
    const delta = daysBetween(entry.date, today);
    return delta >= 0 && delta <= HISTORY_LIMIT_DAYS;
  });
}

export function recordGameResult(params) {
  const stats = loadStats();
  const gameDate = getLocalDateString(
    typeof params.gameStartedAt === "number" ? new Date(params.gameStartedAt) : new Date()
  );
  const lastPlayedDate = stats.lastPlayedDate;
  if (lastPlayedDate === gameDate) {
    return { stats, streakIncreased: false, newMilestone: null };
  }

  const previousStreak = stats.currentStreak;
  let nextStreak = previousStreak;
  if (lastPlayedDate === null) {
    nextStreak = 1;
  } else if (isYesterday(lastPlayedDate, gameDate)) {
    nextStreak = previousStreak + 1;
  } else {
    const delta = daysBetween(lastPlayedDate, gameDate);
    if (delta > 1) {
      nextStreak = 1;
    }
  }

  stats.currentStreak = nextStreak;
  stats.maxStreak = Math.max(stats.maxStreak, nextStreak);
  stats.lastPlayedDate = gameDate;
  stats.totalPlayed += 1;
  if (params.won) stats.totalWon += 1;
  stats.guessDistribution[getGuessDistributionIndex(params.won, params.guesses)] += 1;
  stats.history.push({
    date: gameDate,
    won: params.won,
    guesses: Math.min(6, Math.max(1, Math.floor(params.guesses))),
    countryCode: params.countryCode,
    hintsUsed: Math.max(0, Math.floor(params.hintsUsed)),
  });
  stats.history = trimHistoryToRecentDays(stats.history, gameDate);
  if (stats.firstPlayedDate === null) stats.firstPlayedDate = gameDate;
  saveStats(stats);

  const newMilestone =
    MILESTONES.find((milestone) => stats.currentStreak === milestone && previousStreak < milestone) ??
    null;
  return {
    stats,
    streakIncreased: stats.currentStreak > previousStreak,
    newMilestone,
  };
}

export function resetStats() {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function exportStats() {
  return JSON.stringify(loadStats());
}

export function importStats(json) {
  try {
    saveStats(sanitizeStats(JSON.parse(json)));
    return true;
  } catch {
    return false;
  }
}

export function incrementShareCount() {
  const stats = loadStats();
  stats.shareCount += 1;
  saveStats(stats);
}

export function getWinRate(stats) {
  if (stats.totalPlayed <= 0) return 0;
  return Math.round((stats.totalWon / stats.totalPlayed) * 100);
}
