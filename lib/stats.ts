import { daysBetween, getLocalDateString, isYesterday } from "../utils/date";

const STORAGE_KEY = "flaglette.stats.v1";
const SCHEMA_VERSION = 1 as const;
const MILESTONES = [7, 30, 100] as const;
const HISTORY_LIMIT_DAYS = 60;

export interface FlagletteHistoryEntry {
  date: string;
  won: boolean;
  guesses: number;
  countryCode: string;
  hintsUsed: number;
}

export interface FlagletteStats {
  schemaVersion: 1;
  currentStreak: number;
  maxStreak: number;
  lastPlayedDate: string | null;
  totalPlayed: number;
  totalWon: number;
  guessDistribution: [number, number, number, number, number, number, number];
  history: FlagletteHistoryEntry[];
  firstPlayedDate: string | null;
  shareCount: number;
}

export interface RecordGameResultParams {
  won: boolean;
  guesses: number;
  countryCode: string;
  hintsUsed: number;
  gameStartedAt?: number;
}

export interface RecordGameResultResult {
  stats: FlagletteStats;
  streakIncreased: boolean;
  newMilestone: number | null;
}

export const DEFAULT_STATS: FlagletteStats = {
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

function cloneDefaultStats(): FlagletteStats {
  return {
    ...DEFAULT_STATS,
    guessDistribution: [...DEFAULT_STATS.guessDistribution] as FlagletteStats["guessDistribution"],
    history: [],
  };
}

function sanitizeStats(input: unknown): FlagletteStats {
  if (typeof input !== "object" || input === null) {
    return cloneDefaultStats();
  }
  const raw = input as Partial<FlagletteStats>;
  const normalized: FlagletteStats = cloneDefaultStats();
  normalized.currentStreak = Number.isFinite(raw.currentStreak)
    ? Math.max(0, Math.floor(raw.currentStreak as number))
    : 0;
  normalized.maxStreak = Number.isFinite(raw.maxStreak)
    ? Math.max(0, Math.floor(raw.maxStreak as number))
    : 0;
  normalized.lastPlayedDate =
    typeof raw.lastPlayedDate === "string" ? raw.lastPlayedDate : null;
  normalized.totalPlayed = Number.isFinite(raw.totalPlayed)
    ? Math.max(0, Math.floor(raw.totalPlayed as number))
    : 0;
  normalized.totalWon = Number.isFinite(raw.totalWon)
    ? Math.max(0, Math.floor(raw.totalWon as number))
    : 0;
  if (Array.isArray(raw.guessDistribution) && raw.guessDistribution.length === 7) {
    normalized.guessDistribution = raw.guessDistribution.map((n) =>
      Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
    ) as FlagletteStats["guessDistribution"];
  }
  if (Array.isArray(raw.history)) {
    normalized.history = raw.history
      .map((entry): FlagletteHistoryEntry | null => {
        if (typeof entry !== "object" || entry === null) return null;
        const e = entry as Partial<FlagletteHistoryEntry>;
        if (
          typeof e.date !== "string" ||
          typeof e.won !== "boolean" ||
          !Number.isFinite(e.guesses) ||
          typeof e.countryCode !== "string" ||
          !Number.isFinite(e.hintsUsed)
        ) {
          return null;
        }
        return {
          date: e.date,
          won: e.won,
          guesses: Math.max(1, Math.floor(e.guesses)),
          countryCode: e.countryCode,
          hintsUsed: Math.max(0, Math.floor(e.hintsUsed)),
        };
      })
      .filter((entry): entry is FlagletteHistoryEntry => entry !== null);
  }
  normalized.firstPlayedDate =
    typeof raw.firstPlayedDate === "string" ? raw.firstPlayedDate : null;
  normalized.shareCount = Number.isFinite(raw.shareCount)
    ? Math.max(0, Math.floor(raw.shareCount as number))
    : 0;
  if (normalized.maxStreak < normalized.currentStreak) {
    normalized.maxStreak = normalized.currentStreak;
  }
  normalized.schemaVersion = SCHEMA_VERSION;
  return normalized;
}

export function loadStats(): FlagletteStats {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return cloneDefaultStats();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefaultStats();
    const parsed = JSON.parse(raw) as unknown;
    return sanitizeStats(parsed);
  } catch {
    return cloneDefaultStats();
  }
}

export function saveStats(stats: FlagletteStats): void {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return;
  }
  try {
    const normalized = sanitizeStats(stats);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    /* ignore storage errors */
  }
}

function getGuessDistributionIndex(won: boolean, guesses: number): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  if (!won) return 6;
  const normalizedGuesses = Math.min(6, Math.max(1, Math.floor(guesses)));
  return (normalizedGuesses - 1) as 0 | 1 | 2 | 3 | 4 | 5;
}

function trimHistoryToRecentDays(history: FlagletteHistoryEntry[], today: string): FlagletteHistoryEntry[] {
  return history.filter((entry) => {
    const delta = daysBetween(entry.date, today);
    return delta >= 0 && delta <= HISTORY_LIMIT_DAYS;
  });
}

export function recordGameResult(params: RecordGameResultParams): RecordGameResultResult {
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
  const distributionIndex = getGuessDistributionIndex(params.won, params.guesses);
  stats.guessDistribution[distributionIndex] += 1;
  stats.history.push({
    date: gameDate,
    won: params.won,
    guesses: Math.min(6, Math.max(1, Math.floor(params.guesses))),
    countryCode: params.countryCode,
    hintsUsed: Math.max(0, Math.floor(params.hintsUsed)),
  });
  stats.history = trimHistoryToRecentDays(stats.history, gameDate);
  if (stats.firstPlayedDate === null) {
    stats.firstPlayedDate = gameDate;
  }

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

export function resetStats(): void {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function exportStats(): string {
  const stats = loadStats();
  return JSON.stringify(stats);
}

export function importStats(json: string): boolean {
  try {
    const parsed = JSON.parse(json) as unknown;
    const normalized = sanitizeStats(parsed);
    saveStats(normalized);
    return true;
  } catch {
    return false;
  }
}

export function incrementShareCount(): void {
  const stats = loadStats();
  stats.shareCount += 1;
  saveStats(stats);
}

export function getWinRate(stats: FlagletteStats): number {
  if (stats.totalPlayed <= 0) return 0;
  return Math.round((stats.totalWon / stats.totalPlayed) * 100);
}
