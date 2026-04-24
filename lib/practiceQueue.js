/**
 * Practice Mode — shuffled per-continent ISO queues in localStorage.
 * Pure utilities; no DOM. Key: flaglette_practice_v1
 */

const STORAGE_KEY = "flaglette_practice_v1";
export const PRACTICE_ROUTE_KEYS = [
  "africa",
  "americas",
  "asia",
  "europe",
  "oceania",
  "random",
];

const VALID_KEYS = new Set(PRACTICE_ROUTE_KEYS);

/** @type {Record<string, unknown> | null} */
let memoryStore = null;
let warnedLocalStorage = false;

function warnLocalStorageOnce() {
  if (warnedLocalStorage) return;
  warnedLocalStorage = true;
  console.warn(
    "[practiceQueue] localStorage unavailable; using in-memory queues for this session only."
  );
}

function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalizeContinentKey(continentKey) {
  const k = String(continentKey || "")
    .trim()
    .toLowerCase();
  if (!VALID_KEYS.has(k)) {
    throw new Error(`[practiceQueue] Invalid continent key: "${continentKey}"`);
  }
  return k;
}

/** @param {string} continentKey */
export function isPracticeRouteKey(continentKey) {
  try {
    normalizeContinentKey(continentKey);
    return true;
  } catch {
    return false;
  }
}

function readRoot() {
  if (memoryStore !== null) {
    return { ...memoryStore };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    console.warn("[practiceQueue] Corrupted JSON; wiping storage.", e);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {
      /* ignore */
    }
    return {};
  }
}

function writeRoot(obj) {
  if (memoryStore !== null) {
    memoryStore = { ...obj };
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch (e) {
    warnLocalStorageOnce();
    memoryStore = { ...obj };
  }
}

function readBucket(root, continentKey) {
  const e = root[continentKey];
  if (!e || typeof e !== "object") return null;
  return e;
}

/**
 * @param {string} continentKey — africa | americas | asia | europe | oceania | random
 * @param {Array<{ code: string, [key: string]: unknown }>} allCountriesForContinent — full country rows for this scope
 * @returns {{ country: (typeof allCountriesForContinent)[0] | undefined, isFreshCycle: boolean }}
 */
export function getNext(continentKey, allCountriesForContinent) {
  const key = normalizeContinentKey(continentKey);
  const isoSource = allCountriesForContinent.map((c) => c.code);
  const byCode = new Map(allCountriesForContinent.map((c) => [c.code, c]));

  if (isoSource.length === 0) {
    return { country: undefined, isFreshCycle: false };
  }

  const root = readRoot();
  let entry = readBucket(root, key);

  const needsNewQueue =
    !entry ||
    !Array.isArray(entry.remaining) ||
    entry.remaining.length === 0;

  let isFreshCycle = false;

  if (needsNewQueue) {
    isFreshCycle = !!(entry && entry.awaitingRecycle === true);
    entry = {
      remaining: shuffle([...isoSource]),
      cycleSize: isoSource.length,
      awaitingRecycle: false,
      lastPlayed: new Date().toISOString(),
    };
  }

  const iso = entry.remaining.shift();
  entry.lastPlayed = new Date().toISOString();
  if (entry.remaining.length === 0) {
    entry.awaitingRecycle = true;
  }

  root[key] = entry;
  writeRoot(root);

  return {
    country: byCode.get(iso),
    isFreshCycle,
  };
}

/**
 * @param {string} continentKey
 * @param {number} totalForContinent — total countries in scope (e.g. bucket length)
 * @returns {{ played: number, total: number }}
 */
export function getQueueProgress(continentKey, totalForContinent) {
  const key = normalizeContinentKey(continentKey);
  const root = readRoot();
  const entry = readBucket(root, key);
  const total =
    entry && typeof entry.cycleSize === "number" && entry.cycleSize > 0
      ? entry.cycleSize
      : totalForContinent;
  const rem =
    entry && Array.isArray(entry.remaining) ? entry.remaining.length : total;
  const played = Math.max(0, total - rem);
  return { played, total };
}

/** @param {string} continentKey */
export function resetQueue(continentKey) {
  const key = normalizeContinentKey(continentKey);
  const root = readRoot();
  delete root[key];
  writeRoot(root);
}

export function resetAllQueues() {
  memoryStore = {};
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (_) {
    /* ignore */
  }
}

/*
 * --- Sanity scenarios (mental model) ---
 *
 * 1) Fresh user picks Oceania (N countries in the dataset)
 *    - getNext("oceania", oceaniaRows): storage had no bucket → new queue of N
 *      ISOs shuffled, shift one → return that country, remaining length N − 1,
 *      isFreshCycle === false (first cycle, not a re-shuffle after completion).
 *
 * 2) User plays N Oceania games in a row (full cycle)
 *    - After each getNext, remaining shrinks; after the Nth call remaining is []
 *      and awaitingRecycle is true.
 *    - (N+1)th getNext: rebuilds a fresh shuffle of N, returns the first puzzle of
 *      the new cycle, isFreshCycle === true.
 *
 * 3) Stored Oceania queue is [FJ, NZ, AU] (already shuffled & persisted)
 *    - getNext("oceania", [FJ,NZ,AU rows]): shifts "FJ" → returns Fiji row,
 *      persisted remaining becomes [NZ, AU], isFreshCycle === false.
 */
