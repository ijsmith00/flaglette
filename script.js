import { getCountriesByContinent } from "./lib/getCountriesByContinent.js";
import {
  getNext,
  getQueueProgress,
  isPracticeRouteKey,
} from "./lib/practiceQueue.js";
import {
  loadStats,
  recordGameResult,
  resetStats,
  saveStats,
} from "./lib/stats.js";
import { trackEvent } from "./lib/analytics.js";

let currentCountry = null;
let attempts = 0;
const maxAttempts = 6;
let gameStartedAt = null;
const SAVE_SCHEMA_VERSION = 5;
/** Share body line 3 — no protocol (spec). Link fields use SHARE_SITE_LINK_URL. */
const SHARE_SITE_TEXT_LINE = "flaglette.com";
const SHARE_SITE_LINK_URL = "https://flaglette.com/";
const HOWTO_STORAGE_KEY = "flaglette_howto_seen_v2";
let isGameOver = false;
/** Filled after persist and when restoring the complete screen for share text. */
let shareSnapshot = null;
/** Set when URL has ?play=XX / ?country=XX / ?test=XX (ISO2) — no daily save, skips today’s complete gate. */
let practiceModeCode = null;
/** Set while `/practice/:continentKey` play UI is active — no daily save, custom end screen. */
let practiceRouteContinentKey = null;
/** Cached full country list after first load. */
let allCountriesCache = null;
/** @type {Promise<unknown[]> | null} */
let dataLoadPromise = null;
/** ISO2 → English terrain line (third hint); filled from `terrain-hints-proposal.json` or `#terrain-hints-embedded`. */
let terrainHintsByCode = {};

const PRACTICE_PICKER_ROWS = [
  { routeKey: "americas", emoji: "🌎", label: "Americas" },
  { routeKey: "europe", emoji: "🌍", label: "Europe" },
  { routeKey: "asia", emoji: "🌏", label: "Asia" },
  { routeKey: "africa", emoji: "🌍", label: "Africa" },
  { routeKey: "oceania", emoji: "🌏", label: "Oceania" },
  { divider: true },
  { routeKey: "random", emoji: "🎲", label: "Random (all)" },
];

let practiceCycleToastTimerId = null;
let dailyHintsToggleWired = false;
let statsDialogInited = false;
let statsAutoOpenTimerId = null;

const SESSION_PRACTICE_FROM_PICKER = "fl_pr_play_from_picker";

function trackPracticeEvent(eventName, params) {
  trackEvent(eventName, params);
}

function markPracticePlayEnteredFromPicker() {
  try {
    sessionStorage.setItem(SESSION_PRACTICE_FROM_PICKER, "1");
  } catch (_) {
    /* ignore */
  }
}

function consumePracticePlayEnteredFromPicker() {
  try {
    if (sessionStorage.getItem(SESSION_PRACTICE_FROM_PICKER)) {
      sessionStorage.removeItem(SESSION_PRACTICE_FROM_PICKER);
      return true;
    }
  } catch (_) {
    /* ignore */
  }
  return false;
}

/**
 * Direct opens of `/practice/:key` often have a single history entry, so Back would skip
 * the picker. Synthesize `/practice` underneath (same as stacking from the picker UI).
 * In-app picker navigation already pushed `/practice` first — then skip.
 */
function ensurePracticePlayHistoryStack(routeKey) {
  if (usesHashRouting()) return;
  const fromPicker = consumePracticePlayEnteredFromPicker();
  if (fromPicker) return;
  const playPath = `/practice/${routeKey}`;
  try {
    if (window.location.pathname !== playPath) return;
    window.history.replaceState({}, "", "/practice");
    window.history.pushState({}, "", playPath);
  } catch (e) {
    console.warn("[practice] Could not adjust history stack", e);
  }
}

/** Optional ISO2 code from query (?play=PT&…). */
function getPracticeModeCodeFromUrl() {
  try {
    const p = new URLSearchParams(window.location.search);
    const v = p.get("play") || p.get("country") || p.get("test");
    if (!v || typeof v !== "string") return null;
    const code = v.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) return null;
    return code;
  } catch (_) {
    return null;
  }
}

/** `file://` pages have no real pathname for SPA segments — use `#/practice` instead. */
function usesHashRouting() {
  return window.location.protocol === "file:";
}

function pathFromLocationForRouter() {
  if (usesHashRouting()) {
    const h = window.location.hash;
    if (!h || h === "#") return "/";
    const inner = h.replace(/^#/, "").trim() || "/";
    return inner.replace(/\/+$/, "") || "/";
  }
  const raw = window.location.pathname || "/";
  return raw.replace(/\/+$/, "") || "/";
}

function parseRoute() {
  const path = pathFromLocationForRouter();
  if (path === "/practice") return { type: "practice-picker" };
  const m = path.match(/^\/practice\/([^/]+)$/i);
  if (m) return { type: "practice-play", key: m[1].toLowerCase() };
  return { type: "home" };
}

const DAILY_RESUME_KEY = "flaglette_daily_resume_v1";

function clearDailyResumeSnapshot() {
  try {
    sessionStorage.removeItem(DAILY_RESUME_KEY);
  } catch (_) {
    /* ignore */
  }
}

/** Persist in-progress daily guesses when leaving `/` for routed practice (same tab). */
function snapshotDailyProgressForResume() {
  if (getPracticeModeCodeFromUrl()) return;
  if (practiceRouteContinentKey) return;
  if (!currentCountry || isGameOver) return;
  try {
    const raw = localStorage.getItem(getDailyStorageKey());
    if (raw) {
      const st = migrateDailyPayload(JSON.parse(raw));
      if (st && st.completed === true) return;
    }
  } catch (_) {
    /* ignore */
  }
  try {
    sessionStorage.setItem(
      DAILY_RESUME_KEY,
      JSON.stringify({
        dateKey: getLocalDateKeyString(),
        code: currentCountry.code,
        attempts,
      })
    );
  } catch (_) {
    /* ignore */
  }
}

function appendHintsThroughWrongAttempts(country, wrongAttempts) {
  clearHints();
  const n = Math.min(maxAttempts, Math.max(0, wrongAttempts));
  for (let a = 1; a <= n; a++) {
    if (a === 1) {
      appendHintLine(`Continent: ${country.continent ?? "—"}`);
    } else if (a === 2) {
      appendHintLine(`Neighboring countries: ${formatNeighborsHint(country)}`);
    } else if (a === 3) {
      const terrainRaw = terrainHintsByCode[country.code];
      const terrain = typeof terrainRaw === "string" ? terrainRaw.trim() : "";
      appendHintLine(terrain ? `Terrain: ${terrain}` : "Terrain: —");
    } else if (a === 4) {
      appendHintLine(`Starts with: ${country.first_letter_en}`);
    } else if (a === 5) {
      appendHintLine(
        `Name length (letters): ${letterCountFromName(country.name_en)}`
      );
    }
  }
}

/** @returns {boolean} true if a session was restored */
function consumeDailyResumeIfValid(countries) {
  try {
    const raw = sessionStorage.getItem(DAILY_RESUME_KEY);
    if (!raw) return false;
    const o = JSON.parse(raw);
    if (o.dateKey !== getLocalDateKeyString()) return false;
    const code = typeof o.code === "string" ? o.code : "";
    const found = countries.find((c) => c.code === code);
    if (!found) return false;
    currentCountry = found;
    attempts = Math.min(maxAttempts, Math.max(0, Math.floor(Number(o.attempts)) || 0));
    appendHintsThroughWrongAttempts(found, attempts);
    sessionStorage.removeItem(DAILY_RESUME_KEY);
    return true;
  } catch (_) {
    return false;
  }
}

function navigate(path) {
  const from = parseRoute();
  if (
    from.type === "home" &&
    (path === "/practice" || path.startsWith("/practice/"))
  ) {
    snapshotDailyProgressForResume();
  }
  if (usesHashRouting()) {
    const nextHash = path === "/" ? "" : `#${path}`;
    if ((window.location.hash || "") === nextHash) {
      renderRoute().catch((err) => console.error(err));
    } else {
      window.location.hash = nextHash;
    }
    return;
  }
  window.history.pushState({}, "", path);
  renderRoute().catch((err) => console.error(err));
}

function isPathPracticePlay() {
  return practiceRouteContinentKey != null;
}

function practiceLabelFromRouteKey(key) {
  if (key === "random") return "Random";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function getCountryListForPracticeKey(routeKey, allCountries) {
  if (routeKey === "random") return [...allCountries];
  const byCont = getCountriesByContinent(allCountries);
  const map = {
    africa: "Africa",
    americas: "Americas",
    asia: "Asia",
    europe: "Europe",
    oceania: "Oceania",
  };
  const bucket = map[routeKey];
  return bucket ? [...(byCont[bucket] || [])] : [];
}

function ensureCountriesTerrain() {
  if (dataLoadPromise) return dataLoadPromise;
  dataLoadPromise = Promise.all([loadCountries(), loadTerrainHints()]).then(
    ([countries, terrainMap]) => {
      allCountriesCache = countries;
      terrainHintsByCode =
        terrainMap && typeof terrainMap === "object" ? terrainMap : {};
      return countries;
    }
  );
  return dataLoadPromise;
}

function removeLegacyPracticeBanner() {
  document.getElementById("legacy-practice-banner")?.remove();
}

function hidePracticeCycleToast() {
  const el = document.getElementById("practice-cycle-toast");
  if (practiceCycleToastTimerId != null) {
    clearTimeout(practiceCycleToastTimerId);
    practiceCycleToastTimerId = null;
  }
  if (el) el.hidden = true;
}

function showPracticeFreshCycleToast(routeKey, nCountries) {
  hidePracticeCycleToast();
  const el = document.getElementById("practice-cycle-toast");
  if (!el) return;
  if (routeKey === "random") {
    el.textContent = `🎉 You've played all ${nCountries} countries! Starting a fresh round.`;
  } else {
    el.textContent = `🎉 You've played all ${nCountries} ${practiceLabelFromRouteKey(
      routeKey
    )} countries! Starting a fresh round.`;
  }
  el.hidden = false;
  practiceCycleToastTimerId = setTimeout(() => {
    el.hidden = true;
    practiceCycleToastTimerId = null;
  }, 3000);
}

function setPracticeChromeLabel(routeKey) {
  const el = document.getElementById("practice-mode-label");
  if (!el) return;
  el.textContent = `Practice · ${practiceLabelFromRouteKey(routeKey)}`;
}

function setPracticePlaySurfaceVisible(visible) {
  const guessRow = document.querySelector("#game-zone .guess-row");
  const hints = document.getElementById("hints");
  const attemptsEl = document.getElementById("attempts");
  const feedbackBlock = document.getElementById("feedback-block");
  const dailyHintsToggle = document.getElementById("daily-hints-toggle");
  if (dailyHintsToggle) {
    dailyHintsToggle.hidden = true;
    dailyHintsToggle.setAttribute("aria-expanded", "false");
    dailyHintsToggle.textContent = "▶ Show hints";
  }
  const hidden = !visible;
  if (guessRow) guessRow.hidden = hidden;
  if (hints) hints.hidden = hidden;
  if (attemptsEl) attemptsEl.hidden = hidden;
  if (feedbackBlock) feedbackBlock.hidden = hidden;
}

function hidePracticeResultPanel() {
  const result = document.getElementById("practice-result");
  if (result) result.hidden = true;
}

function resetRoundStateForNewPuzzle() {
  attempts = 0;
  isGameOver = false;
  const input = document.getElementById("guess-input");
  if (input) input.value = "";
}

function renderPracticePickerList() {
  const ul = document.getElementById("practice-continent-list");
  if (!ul || !allCountriesCache) return;
  ul.innerHTML = "";
  for (const def of PRACTICE_PICKER_ROWS) {
    if (def.divider) {
      const li = document.createElement("li");
      li.className = "practice-continent-row--divider";
      li.setAttribute("aria-hidden", "true");
      ul.appendChild(li);
      continue;
    }
    const list = getCountryListForPracticeKey(def.routeKey, allCountriesCache);
    const total = list.length;
    if (total === 0) {
      continue;
    }
    const { played } = getQueueProgress(def.routeKey, total);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "practice-continent-row";
    btn.setAttribute(
      "aria-label",
      `${def.label}, ${total} countries, ${played} of ${total} played`
    );
    const main = document.createElement("span");
    main.className = "practice-continent-row__main";
    main.appendChild(document.createTextNode(`${def.emoji} ${def.label}`));
    const meta = document.createElement("span");
    meta.className = "practice-continent-row__meta";
    meta.textContent = `${total} countries · ${played}/${total} played`;
    btn.appendChild(main);
    btn.appendChild(meta);
    btn.addEventListener("click", () => {
      trackPracticeEvent("practice_continent_selected", {
        continent_key: def.routeKey,
      });
      markPracticePlayEnteredFromPicker();
      navigate(`/practice/${def.routeKey}`);
    });
    const li = document.createElement("li");
    li.appendChild(btn);
    ul.appendChild(li);
  }
}

function startPracticeRoundFromRoute(routeKey) {
  const list = getCountryListForPracticeKey(routeKey, allCountriesCache);
  if (list.length === 0) {
    navigate("/practice");
    return;
  }
  const { country, isFreshCycle } = getNext(routeKey, list);
  if (!country) {
    navigate("/practice");
    return;
  }
  hidePracticeResultPanel();
  setPracticePlaySurfaceVisible(true);
  resetRoundStateForNewPuzzle();
  currentCountry = country;
  trackEvent("game_started", { mode: "practice" });
  if (isFreshCycle) {
    showPracticeFreshCycleToast(routeKey, list.length);
  } else {
    hidePracticeCycleToast();
  }
  hideShareRow();
  clearFeedbackAnswerComment();
  renderFlagImage(currentCountry);
  updateAttemptsDisplay();
  clearHints();
  const feedback = document.getElementById("feedback");
  if (feedback) {
    feedback.textContent = "";
    feedback.className = "";
  }
  setInputsDisabled(false);
  document.getElementById("guess-input")?.focus();
}

function finishPracticeRound(won) {
  setPracticePlaySurfaceVisible(false);
  const result = document.getElementById("practice-result");
  const title = document.getElementById("practice-result-title");
  const tilEl = document.getElementById("practice-result-til");
  if (title) {
    title.textContent = won
      ? `✓ You got it in ${attempts + 1}!`
      : `The answer was ${currentCountry.name_en}`;
  }
  const tilRaw =
    typeof currentCountry?.til === "string" ? currentCountry.til : "";
  if (tilEl) tilEl.textContent = tilRaw.trim() || "—";
  if (result) result.hidden = false;
  const guesses = won ? attempts + 1 : maxAttempts;
  trackEvent("practice_completed", {
    continent: practiceRouteContinentKey,
    won,
    guesses,
  });
  requestAnimationFrame(() => {
    document.getElementById("practice-next-btn")?.focus();
  });
}

function onPracticeNextCountry() {
  if (!practiceRouteContinentKey) return;
  startPracticeRoundFromRoute(practiceRouteContinentKey);
}

/** V1.1 practice mode: random country from list (unused for now). */
function pickRandomCountry(countries) {
  const i = Math.floor(Math.random() * countries.length);
  return countries[i];
}

/** Local calendar date as YYYYMMDD (storage key). */
function getLocalDateKeyString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** YYYYMMDD as integer — same day always yields the same seed. */
function getLocalDateSeedNumber() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** localStorage key: flaglette_daily_YYYYMMDD */
function getDailyStorageKey() {
  return `flaglette_daily_${getLocalDateKeyString()}`;
}

/**
 * Daily answer: local date as a number, modulo pool length.
 * @param {object[]} coreCountries countries with tier === "daily"
 */
function getDailyCountry(coreCountries) {
  const n = getLocalDateSeedNumber();
  const idx = n % coreCountries.length;
  return coreCountries[idx];
}

/** Days since local 2026-01-01, plus 1 */
function getDailyGameNumber() {
  const epoch = new Date(2026, 0, 1);
  const t = new Date();
  const t0 = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const e0 = new Date(
    epoch.getFullYear(),
    epoch.getMonth(),
    epoch.getDate()
  ).getTime();
  return Math.floor((t0 - e0) / 864e5) + 1;
}

/**
 * Legacy save (3 guesses): normalize maxGuesses and schemaVersion.
 * v3: drop stripeEmojiLine; share grid from won + attempts.
 * v4: optional share fields countryCode, comment, emoji for share text.
 * v5: `comment` → `til` (English-only trivia line).
 */
function migrateDailyPayload(p) {
  if (!p || typeof p !== "object") return p;
  const maxGuesses = p.maxGuesses ?? (p.schemaVersion >= 2 ? 6 : 3);
  let out = { ...p, maxGuesses, schemaVersion: p.schemaVersion ?? 1 };

  if (out.schemaVersion < SAVE_SCHEMA_VERSION && out.completed === true) {
    try {
      const maxG = out.maxGuesses;
      const won = out.won === true;
      let att = out.attempts;
      if (typeof att !== "number" || Number.isNaN(att)) {
        att = won ? 1 : maxG;
      } else {
        att = Math.min(Math.max(1, Math.floor(att)), maxG);
      }
      const next = {
        ...out,
        won,
        attempts: att,
        hintsUsed: out.hintsUsed ?? 0,
        schemaVersion: SAVE_SCHEMA_VERSION,
      };
      delete next.stripeEmojiLine;
      if (typeof next.comment === "string" && next.til === undefined) {
        next.til = next.comment;
        delete next.comment;
      }
      return next;
    } catch (_) {
      return { ...out, completed: false };
    }
  }

  return out;
}

/** Letter count of English country name (spaces excluded) */
function letterCountFromName(nameEn) {
  return String(nameEn || "").replace(/\s/g, "").length;
}

/**
 * ISO 3166-1 alpha-2 (e.g. "FR", "gr") → flag emoji (e.g. "🇫🇷", "🇬🇷").
 * Uses regional indicator symbols U+1F1E6..U+1F1FF. Invalid input → "".
 */
function countryISO2ToFlagEmoji(iso2) {
  if (typeof iso2 !== "string" || iso2.length !== 2) return "";
  const u = iso2.toUpperCase();
  if (!/^[A-Z]{2}$/.test(u)) return "";
  const base = 0x1f1e6;
  return String.fromCodePoint(
    base + (u.charCodeAt(0) - 65),
    base + (u.charCodeAt(1) - 65)
  );
}

/** Neighboring countries hint line (English only). Empty = no land borders in REST data (e.g. islands). */
function formatNeighborsHint(country) {
  const n = country.neighbors_en ?? [];
  if (n.length === 0) {
    return "🏝️ No bordering countries in dataset";
  }
  return n.join(", ");
}

/** Restore share snapshot from localStorage for today’s key */
function loadShareSnapshotFromStorage() {
  try {
    const raw = localStorage.getItem(getDailyStorageKey());
    if (!raw) return null;
    const p = migrateDailyPayload(JSON.parse(raw));
    if (!p || !p.completed) return null;
    return {
      won: p.won,
      attempts: p.attempts,
      hintsUsed: p.hintsUsed ?? 0,
      maxGuesses: p.maxGuesses ?? 3,
      countryCode: typeof p.countryCode === "string" ? p.countryCode : undefined,
      til:
        typeof p.til === "string"
          ? p.til
          : typeof p.comment === "string"
            ? p.comment
            : "",
      emoji: typeof p.emoji === "string" ? p.emoji : undefined,
    };
  } catch (_) {
    return null;
  }
}

/** Wordle-style attempt grid: wrong = 🟥, winning guess = 🟩 */
function buildShareAttemptPatternLine(snap) {
  const maxG = snap.maxGuesses ?? maxAttempts;
  const total = snap.attempts;
  if (snap.won) {
    const reds = Math.max(0, total - 1);
    return `${"🟥".repeat(reds)}🟩`;
  }
  return "🟥".repeat(maxG);
}

/** Flag for share line 1: optional `emoji` from data, else derived from ISO2 `countryCode`. */
function getShareFlagEmojiPrefix(snap) {
  if (typeof snap?.emoji === "string" && snap.emoji.trim()) {
    return `${snap.emoji.trim()} `;
  }
  const fe = countryISO2ToFlagEmoji(snap?.countryCode);
  return fe ? `${fe} ` : "";
}

/**
 * Clipboard, Web Share API, X/Facebook quote — identical string.
 * @returns {string}
 */
function getShareableGameResultText() {
  const snap = shareSnapshot || loadShareSnapshotFromStorage();
  if (!snap) return "";
  const n = getDailyGameNumber();
  const maxG = snap.maxGuesses ?? maxAttempts;
  const totalAttempts = snap.attempts;
  let resultEmoji;
  if (snap.won) {
    resultEmoji = totalAttempts === 1 ? "🎯" : "✅";
  } else {
    resultEmoji = "❌";
  }
  const flagPrefix = getShareFlagEmojiPrefix(snap);
  const line1 = `${flagPrefix}Flaglette #${n} ${totalAttempts}/${maxG} ${resultEmoji}`;
  const line2 = buildShareAttemptPatternLine(snap);
  let streakLine = "";
  try {
    const stats = loadStats();
    if ((stats?.currentStreak ?? 0) >= 2) {
      streakLine = `🔥 Streak: ${stats.currentStreak}`;
    }
  } catch (_) {
    /* ignore stats load errors in share text */
  }
  const lines = streakLine ? [line1, line2, streakLine, ""] : [line1, line2, ""];
  lines.push(SHARE_SITE_TEXT_LINE);
  return lines.join("\n");
}

/** @deprecated Use getShareableGameResultText; kept for call-site compatibility */
function generateShareText() {
  return getShareableGameResultText();
}

function wireDailyHintsToggleOnce() {
  if (dailyHintsToggleWired) return;
  const toggle = document.getElementById("daily-hints-toggle");
  if (!toggle) return;
  dailyHintsToggleWired = true;
  toggle.addEventListener("click", () => {
    const hints = document.getElementById("hints");
    if (!hints) return;
    hints.hidden = !hints.hidden;
    const expanded = !hints.hidden;
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.textContent = expanded ? "▼ Hide hints" : "▶ Show hints";
  });
}

/** Daily end only: collapse hints behind a toggle. No-op for practice / legacy ?play=. */
function showDailyHintsCollapsedAfterEnd() {
  if (practiceModeCode || practiceRouteContinentKey) return;
  const toggle = document.getElementById("daily-hints-toggle");
  const hints = document.getElementById("hints");
  if (!toggle || !hints) return;
  hints.hidden = true;
  toggle.hidden = false;
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", "hints");
  toggle.textContent = "▶ Show hints";
  wireDailyHintsToggleOnce();
}

function clearStatsAutoOpenTimer() {
  if (statsAutoOpenTimerId != null) {
    clearTimeout(statsAutoOpenTimerId);
    statsAutoOpenTimerId = null;
  }
}

function renderStatsDialogBody() {
  const body = document.getElementById("stats-dialog-body");
  if (!body) return;
  const stats = loadStats();
  const winRate =
    stats.totalPlayed > 0
      ? Math.round((stats.totalWon / stats.totalPlayed) * 100)
      : null;
  body.innerHTML = `
    <div class="stats-kpi"><span class="stats-kpi__label">Played</span><span class="stats-kpi__value">${stats.totalPlayed}</span></div>
    <div class="stats-kpi"><span class="stats-kpi__label">Won</span><span class="stats-kpi__value">${stats.totalWon}</span></div>
    <div class="stats-kpi"><span class="stats-kpi__label">Win Rate</span><span class="stats-kpi__value">${winRate == null ? "—" : `${winRate}%`}</span></div>
    <div class="stats-kpi"><span class="stats-kpi__label">Streak</span><span class="stats-kpi__value stats-kpi__value--streak">${stats.currentStreak}</span></div>
  `;
}

function openStatsDialog(trigger = "manual") {
  const dlg = document.getElementById("stats-dialog");
  if (!dlg || typeof dlg.showModal !== "function") return;
  renderStatsDialogBody();
  const stats = loadStats();
  trackEvent("stats_modal_opened", {
    trigger,
    current_streak: stats.currentStreak ?? 0,
  });
  dlg.dataset.trigger = trigger;
  if (!dlg.open) dlg.showModal();
}

function scheduleStatsDialogAutoOpen(delayMs = 1200) {
  clearStatsAutoOpenTimer();
  statsAutoOpenTimerId = setTimeout(() => {
    statsAutoOpenTimerId = null;
    openStatsDialog("auto");
  }, delayMs);
}

function initStatsDialog() {
  if (statsDialogInited) return;
  const dlg = document.getElementById("stats-dialog");
  if (!dlg) return;
  statsDialogInited = true;
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) dlg.close();
  });
  document.getElementById("stats-open-btn")?.addEventListener("click", () => {
    openStatsDialog("manual");
  });
  document.getElementById("stats-dialog-close")?.addEventListener("click", () => {
    dlg.close();
  });
}

function isDevelopmentRuntime() {
  try {
    if (typeof window === "undefined" || !window.location) return false;
    const host = window.location.hostname;
    return (
      window.location.protocol === "file:" ||
      host === "localhost" ||
      host === "127.0.0.1"
    );
  } catch (_) {
    return false;
  }
}

function initDevHelpers() {
  if (!isDevelopmentRuntime()) return;
  window.__flaglette = {
    stats: () => loadStats(),
    reset: () => resetStats(),
    setStreak: (n) => {
      const stats = loadStats();
      const next = Math.max(0, Math.floor(Number(n) || 0));
      stats.currentStreak = next;
      stats.maxStreak = Math.max(stats.maxStreak, next);
      if (!stats.lastPlayedDate) {
        stats.lastPlayedDate = getLocalDateKeyString();
      }
      saveStats(stats);
      return stats;
    },
    fakeYesterday: () => {
      const stats = loadStats();
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      stats.lastPlayedDate = `${yyyy}-${mm}-${dd}`;
      if (!stats.firstPlayedDate) {
        stats.firstPlayedDate = stats.lastPlayedDate;
      }
      saveStats(stats);
      return stats;
    },
  };
}

function injectSearchConsoleVerificationMeta() {
  let token = "";
  try {
    if (
      typeof process !== "undefined" &&
      process.env &&
      typeof process.env.NEXT_PUBLIC_SEARCH_CONSOLE_TOKEN === "string"
    ) {
      token = process.env.NEXT_PUBLIC_SEARCH_CONSOLE_TOKEN.trim();
    }
  } catch (_) {
    /* ignore */
  }
  if (!token) return;
  if (typeof document === "undefined") return;
  const existing = document.querySelector('meta[name="google-site-verification"]');
  if (existing) return;
  const meta = document.createElement("meta");
  meta.setAttribute("name", "google-site-verification");
  meta.setAttribute("content", token);
  document.head.appendChild(meta);
}

/** Show inline share row right after the game ends */
function showShareRow() {
  const row = document.getElementById("share-row");
  if (row) row.hidden = false;
  if (!practiceModeCode && !practiceRouteContinentKey) {
    showGameEndNextPuzzleCountdown();
    showDailyHintsCollapsedAfterEnd();
    scheduleStatsDialogAutoOpen(1200);
  }
}

/** Hide inline share row (e.g. when starting a new round) */
function hideShareRow() {
  const row = document.getElementById("share-row");
  if (row) row.hidden = true;
}

/** Copy share string to clipboard; returns success */
async function copyShareTextToClipboard() {
  const text = getShareableGameResultText();
  if (!text.trim()) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    console.warn("Clipboard copy failed", e);
    return false;
  }
}

let shareDialogStatusClearId = null;

function setShareDialogStatus(message) {
  const el = document.getElementById("share-dialog-status");
  if (el) el.textContent = message || "";
  if (shareDialogStatusClearId != null) {
    clearTimeout(shareDialogStatusClearId);
    shareDialogStatusClearId = null;
  }
  if (message) {
    shareDialogStatusClearId = setTimeout(() => {
      if (el) el.textContent = "";
      shareDialogStatusClearId = null;
    }, 4500);
  }
}

/** Share dialog: Instagram/TikTok have no web post API — copy then open app/site */
function openShareDialog() {
  const text = getShareableGameResultText();
  if (!text.trim()) return;
  const snap = shareSnapshot || loadShareSnapshotFromStorage();
  const stats = loadStats();
  trackEvent("share_clicked", {
    result: snap?.won ? "win" : "loss",
    guesses: snap?.attempts ?? 0,
    current_streak: stats.currentStreak ?? 0,
  });
  const dlg = document.getElementById("share-dialog");
  if (!dlg || typeof dlg.showModal !== "function") {
    const btn =
      document.getElementById("share-btn-game") ||
      document.getElementById("share-btn-daily");
    if (btn) copyShareText(btn);
    return;
  }
  setShareDialogStatus("");
  dlg.showModal();
}

async function shareToFacebookFromDialog() {
  const pageUrl = SHARE_SITE_LINK_URL;
  const text = getShareableGameResultText();
  const u = encodeURIComponent(pageUrl);
  const quote = encodeURIComponent(text.replace(/\s+/g, " ").trim().slice(0, 500));
  const url = `https://www.facebook.com/sharer/sharer.php?u=${u}&quote=${quote}`;
  window.open(url, "_blank", "noopener,noreferrer");
  setShareDialogStatus("Facebook share window opened.");
}

function shareToXFromDialog() {
  const text = getShareableGameResultText();
  if (!text.trim()) return;
  const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  window.open(intentUrl, "_blank", "noopener,noreferrer");
  setShareDialogStatus("Post draft opened in a new tab.");
}

async function shareToInstagramFromDialog() {
  if (!(await copyShareTextToClipboard())) {
    setShareDialogStatus("Could not copy — check clipboard permission.");
    return;
  }
  setShareDialogStatus(
    "Copied! Paste in Instagram (caption, Story text, or DM)."
  );
  window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
}

async function shareToTikTokFromDialog() {
  if (!(await copyShareTextToClipboard())) {
    setShareDialogStatus("Could not copy — check clipboard permission.");
    return;
  }
  setShareDialogStatus(
    "Copied! Paste in TikTok caption or another app from the share sheet."
  );
  window.open("https://www.tiktok.com/", "_blank", "noopener,noreferrer");
}

function closeShareDialog() {
  const dlg = document.getElementById("share-dialog");
  if (dlg && typeof dlg.close === "function") dlg.close();
}

async function shareViaSystemSheet() {
  const text = getShareableGameResultText();
  const url = SHARE_SITE_LINK_URL;
  if (!navigator.share) {
    setShareDialogStatus("Sharing is not available in this browser.");
    return;
  }
  try {
    const payload = { title: "Flaglette", text, url };
    await navigator.share(payload);
    closeShareDialog();
  } catch (e) {
    if (e && e.name === "AbortError") return;
    console.warn("Web Share failed", e);
    setShareDialogStatus("Could not open the system share sheet.");
  }
}

let shareDialogInited = false;

function initShareDialog() {
  if (shareDialogInited) return;
  const dlg = document.getElementById("share-dialog");
  if (!dlg) return;
  shareDialogInited = true;

  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) dlg.close();
  });

  const webBtn = document.getElementById("share-opt-system");
  if (webBtn) {
    /* Always show: itch.io / HTTP embeds often lack navigator.share; tap shows status message. */
    webBtn.hidden = false;
    webBtn.addEventListener("click", () => shareViaSystemSheet());
  }

  document.getElementById("share-opt-facebook")?.addEventListener("click", () => {
    shareToFacebookFromDialog();
  });
  document.getElementById("share-opt-x")?.addEventListener("click", () => {
    shareToXFromDialog();
  });
  document.getElementById("share-opt-instagram")?.addEventListener("click", () => {
    shareToInstagramFromDialog();
  });
  document.getElementById("share-opt-tiktok")?.addEventListener("click", () => {
    shareToTikTokFromDialog();
  });

  const copyOnly = document.getElementById("share-copy-only");
  if (copyOnly) {
    copyOnly.addEventListener("click", async () => {
      if (!(await copyShareTextToClipboard())) {
        setShareDialogStatus("Could not copy.");
        return;
      }
      const def = copyOnly.dataset.labelDefault || copyOnly.textContent.trim();
      if (!copyOnly.dataset.labelDefault) copyOnly.dataset.labelDefault = def;
      copyOnly.textContent = "Copied! ✓";
      setShareDialogStatus("Result copied to clipboard.");
      setTimeout(() => {
        copyOnly.textContent = copyOnly.dataset.labelDefault;
      }, 1500);
    });
  }

  const closeBtn = document.getElementById("share-dialog-close");
  if (closeBtn) closeBtn.addEventListener("click", () => dlg.close());
}

/** Copy share text and briefly change the button label */
async function copyShareText(button) {
  if (!(await copyShareTextToClipboard())) return;
  if (!button.dataset.labelDefault) {
    button.dataset.labelDefault = button.textContent.trim();
  }
  const label = button.dataset.labelDefault;
  button.textContent = "Copied! ✓";
  setTimeout(() => {
    button.textContent = label;
  }, 1500);
}

/** Milliseconds until local midnight */
function msUntilNextLocalMidnight() {
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
  return next.getTime() - now.getTime();
}

let midnightCountdownTimerId = null;

function stopMidnightCountdownInterval() {
  if (midnightCountdownTimerId != null) {
    clearInterval(midnightCountdownTimerId);
    midnightCountdownTimerId = null;
  }
}

/** Stop timer and hide in-game “next puzzle” line (daily complete panel uses its own elements). */
function clearMidnightCountdown() {
  stopMidnightCountdownInterval();
  const wrap = document.getElementById("game-end-countdown-wrap");
  if (wrap) wrap.hidden = true;
  const gameNote = document.getElementById("game-end-countdown-note");
  if (gameNote) {
    gameNote.textContent = "";
    gameNote.hidden = true;
  }
}

/** Format seconds as HH:MM:SS */
function formatCountdownHMS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** Countdown to next local midnight (#daily-countdown and/or #game-end-countdown-value). */
function startMidnightCountdown() {
  stopMidnightCountdownInterval();
  const dailyEl = document.getElementById("daily-countdown");
  const gameClock = document.getElementById("game-end-countdown-value");
  const note = document.getElementById("daily-midnight-note");
  const gameNote = document.getElementById("game-end-countdown-note");
  const clocks = [dailyEl, gameClock].filter(Boolean);
  if (clocks.length === 0) return;
  const tick = () => {
    const ms = msUntilNextLocalMidnight();
    if (ms <= 0) {
      const zero = "00:00:00";
      for (const el of clocks) el.textContent = zero;
      if (note) {
        note.textContent = "Refresh the page to play the new daily puzzle.";
        note.hidden = false;
      }
      if (gameNote) {
        gameNote.textContent = "Refresh the page to play the new daily puzzle.";
        gameNote.hidden = false;
      }
      stopMidnightCountdownInterval();
      return;
    }
    const text = formatCountdownHMS(ms / 1000);
    for (const el of clocks) el.textContent = text;
  };
  tick();
  midnightCountdownTimerId = setInterval(tick, 1000);
}

function showGameEndNextPuzzleCountdown() {
  const wrap = document.getElementById("game-end-countdown-wrap");
  if (wrap) wrap.hidden = false;
  const gameNote = document.getElementById("game-end-countdown-note");
  if (gameNote) {
    gameNote.textContent = "";
    gameNote.hidden = true;
  }
  startMidnightCountdown();
}

/** Save progress for today’s key on win/loss (attempts, hints) */
function persistDailyComplete(won) {
  const totalAttempts = won ? attempts + 1 : maxAttempts;
  const wrongBeforeEnd = won ? attempts : maxAttempts;
  const hintsUsed = won ? Math.min(wrongBeforeEnd, 5) : 5;
  const tilRaw =
    typeof currentCountry?.til === "string" ? currentCountry.til : "";
  shareSnapshot = {
    won,
    attempts: totalAttempts,
    hintsUsed,
    maxGuesses: maxAttempts,
    countryCode: currentCountry?.code,
    til: tilRaw,
  };
  if (typeof currentCountry?.emoji === "string" && currentCountry.emoji.trim()) {
    shareSnapshot.emoji = currentCountry.emoji.trim();
  }
  if (practiceModeCode || practiceRouteContinentKey) {
    return;
  }
  const payload = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    completed: true,
    won,
    attempts: totalAttempts,
    maxGuesses: maxAttempts,
    hintsUsed,
    countryCode: currentCountry?.code,
    til: tilRaw,
  };
  if (typeof currentCountry?.emoji === "string" && currentCountry.emoji.trim()) {
    payload.emoji = currentCountry.emoji.trim();
  }
  try {
    localStorage.setItem(getDailyStorageKey(), JSON.stringify(payload));
    clearDailyResumeSnapshot();
  } catch (e) {
    console.warn("localStorage save failed", e);
  }
}

function recordDailyResultForStats(won) {
  if (practiceModeCode || practiceRouteContinentKey) return;
  try {
    const totalAttempts = won ? attempts + 1 : maxAttempts;
    const wrongBeforeEnd = won ? attempts : maxAttempts;
    const hintsUsed = won ? Math.min(wrongBeforeEnd, 5) : 5;
    const out = recordGameResult({
      won,
      guesses: totalAttempts,
      countryCode: currentCountry?.code ?? "",
      hintsUsed,
      gameStartedAt: typeof gameStartedAt === "number" ? gameStartedAt : undefined,
    });
    trackEvent("game_completed", {
      won,
      guesses: totalAttempts,
      hints_used: hintsUsed,
      current_streak: out?.stats?.currentStreak ?? 0,
    });
    if (out?.newMilestone != null) {
      trackEvent("streak_milestone", {
        streak_days: out.newMilestone,
      });
    }
  } catch (e) {
    console.warn("stats record failed", e);
  }
}

/** Today’s puzzle already finished — show complete card only */
function showDailyCompleteScreen(savedRaw) {
  const saved = migrateDailyPayload(savedRaw);
  const maxG = saved.maxGuesses ?? 3;
  const gameZone = document.getElementById("game-zone");
  const panel = document.getElementById("daily-complete");
  const label = document.getElementById("daily-result-label");
  const att = document.getElementById("daily-result-attempts");
  const attMax = document.getElementById("daily-result-max");
  shareSnapshot = {
    won: saved.won,
    attempts: saved.attempts,
    hintsUsed: saved.hintsUsed ?? 0,
    maxGuesses: maxG,
    countryCode: typeof saved.countryCode === "string" ? saved.countryCode : undefined,
    til:
      typeof saved.til === "string"
        ? saved.til
        : typeof saved.comment === "string"
          ? saved.comment
          : "",
    emoji: typeof saved.emoji === "string" ? saved.emoji : undefined,
  };
  if (gameZone) gameZone.hidden = true;
  if (panel) panel.hidden = false;
  if (label) label.textContent = saved.won ? "Solved" : "Failed";
  if (att) att.textContent = String(saved.attempts ?? "—");
  if (attMax) attMax.textContent = String(maxG);
  const shareDaily = document.getElementById("share-btn-daily");
  if (shareDaily) {
    shareDaily.onclick = () => openShareDialog();
  }
  document.getElementById("home-secondary-actions") &&
    (document.getElementById("home-secondary-actions").hidden = false);
  document.getElementById("practice-picker-view") &&
    (document.getElementById("practice-picker-view").hidden = true);
  document.getElementById("practice-play-chrome") &&
    (document.getElementById("practice-play-chrome").hidden = true);
  clearMidnightCountdown();
  startMidnightCountdown();
  scheduleStatsDialogAutoOpen(0);
}

/** Normalize guess string for comparison */
function normalize(str) {
  return str.trim().toLowerCase();
}

/** Correct if guess matches English country name */
function isCorrectGuess(guess, country) {
  const g = normalize(guess);
  return g === normalize(country.name_en);
}

/** Show daily flag image (flagcdn); round 1 hint is visual only. */
function renderFlagImage(country) {
  const display = document.getElementById("flag-display");
  if (!display) return;
  display.innerHTML = "";
  const url = country?.flagUrl;
  if (!url) return;
  const frame = document.createElement("div");
  frame.className = "flag-display-frame";
  const img = document.createElement("img");
  img.className = "flag-display-img";
  img.src = url;
  img.alt = "";
  img.setAttribute("role", "presentation");
  img.loading = "eager";
  img.decoding = "async";
  frame.appendChild(img);
  display.appendChild(frame);
  hideCountryCommentUnderFlag();
}

/** TIL is not shown under the flag during play—only after game over (see `setFeedbackAnswerComment`). */
function hideCountryCommentUnderFlag() {
  const el = document.getElementById("country-comment");
  if (!el) return;
  el.textContent = "";
  el.hidden = true;
}

/** After win/loss: show `til` under the answer line (hidden if empty). */
function setFeedbackAnswerComment(country) {
  const el = document.getElementById("feedback-answer-comment");
  const flagLine = document.getElementById("country-comment");
  if (!el) return;
  const raw = typeof country?.til === "string" ? country.til : "";
  const text = raw.trim();
  if (!text) {
    el.textContent = "";
    el.hidden = true;
    hideCountryCommentUnderFlag();
    return;
  }
  el.textContent = `\u{1F4CD} ${text}`;
  el.hidden = false;
  if (flagLine) flagLine.hidden = true;
}

function clearFeedbackAnswerComment() {
  const el = document.getElementById("feedback-answer-comment");
  if (el) {
    el.textContent = "";
    el.hidden = true;
  }
  hideCountryCommentUnderFlag();
}

/** Update #attempts label */
function updateAttemptsDisplay() {
  const el = document.getElementById("attempts");
  if (el) el.textContent = `Guesses: ${attempts} / ${maxAttempts}`;
}

/** Clear hints container */
function clearHints() {
  const el = document.getElementById("hints");
  if (el) el.innerHTML = "";
}

/** Append one hint line (stacked, enter animation) */
function appendHintLine(text) {
  const root = document.getElementById("hints");
  if (!root) return;
  const line = document.createElement("div");
  line.className = "hint-line hint-line--enter";
  line.textContent = text;
  root.appendChild(line);
  requestAnimationFrame(() => {
    line.classList.add("hint-line--visible");
  });
}

/** Enable/disable input and submit */
function setInputsDisabled(disabled) {
  document.getElementById("guess-input").disabled = disabled;
  document.getElementById("submit-btn").disabled = disabled;
}

/** Submit guess: win/lose, hints, daily save, share row */
function handleGuess() {
  if (isGameOver) return;

  const input = document.getElementById("guess-input");
  const feedback = document.getElementById("feedback");
  const value = input.value;

  if (!value.trim()) return;

  if (isCorrectGuess(value, currentCountry)) {
    feedback.textContent = `Correct! It's ${currentCountry.name_en} 🎉`;
    feedback.className = "feedback-success";
    isGameOver = true;
    setInputsDisabled(true);
    setFeedbackAnswerComment(currentCountry);
    if (isPathPracticePlay()) {
      finishPracticeRound(true);
    } else {
      recordDailyResultForStats(true);
      persistDailyComplete(true);
      showShareRow();
    }
    return;
  }

  attempts += 1;
  updateAttemptsDisplay();

  if (attempts === 1) {
    trackEvent("hint_revealed", { hint_number: 1 });
    appendHintLine(`Continent: ${currentCountry.continent ?? "—"}`);
  } else if (attempts === 2) {
    trackEvent("hint_revealed", { hint_number: 2 });
    appendHintLine(`Neighboring countries: ${formatNeighborsHint(currentCountry)}`);
  } else if (attempts === 3) {
    trackEvent("hint_revealed", { hint_number: 3 });
    const terrainRaw = terrainHintsByCode[currentCountry.code];
    const terrain =
      typeof terrainRaw === "string" ? terrainRaw.trim() : "";
    appendHintLine(terrain ? `Terrain: ${terrain}` : "Terrain: —");
  } else if (attempts === 4) {
    trackEvent("hint_revealed", { hint_number: 4 });
    appendHintLine(`Starts with: ${currentCountry.first_letter_en}`);
  } else if (attempts === 5) {
    trackEvent("hint_revealed", { hint_number: 5 });
    appendHintLine(
      `Name length (letters): ${letterCountFromName(currentCountry.name_en)}`
    );
  } else if (attempts === 6) {
    feedback.textContent = `Game over. The answer was ${currentCountry.name_en}.`;
    feedback.className = "feedback-error";
    isGameOver = true;
    setInputsDisabled(true);
    input.value = "";
    setFeedbackAnswerComment(currentCountry);
    if (isPathPracticePlay()) {
      finishPracticeRound(false);
    } else {
      recordDailyResultForStats(false);
      persistDailyComplete(false);
      showShareRow();
    }
    return;
  }

  feedback.textContent = "Not quite. Try again!";
  feedback.className = "feedback-error";
  clearFeedbackAnswerComment();
  input.value = "";
}

/** Load data from #countries-embedded or countries.json */
async function loadCountries() {
  const embedded = document.getElementById("countries-embedded");

  if (window.location.protocol === "file:") {
    if (!embedded) {
      throw new Error("file:// URLs require embedded #countries-embedded data.");
    }
    return JSON.parse(embedded.textContent);
  }

  try {
    const response = await fetch("countries.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } catch (err) {
    if (embedded) {
      return JSON.parse(embedded.textContent);
    }
    throw err;
  }
}

/** Load terrain hint strings from #terrain-hints-embedded or terrain-hints-proposal.json */
async function loadTerrainHints() {
  const embedded = document.getElementById("terrain-hints-embedded");

  if (window.location.protocol === "file:") {
    if (!embedded) {
      return {};
    }
    return JSON.parse(embedded.textContent);
  }

  try {
    const response = await fetch("terrain-hints-proposal.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } catch (err) {
    if (embedded) {
      return JSON.parse(embedded.textContent);
    }
    console.warn("terrain-hints-proposal.json missing; third hint will show em dash.", err);
    return {};
  }
}

function shouldOpenHowtoFromQuery() {
  try {
    const v = new URLSearchParams(window.location.search).get("howto");
    if (!v || typeof v !== "string") return false;
    const t = v.trim().toLowerCase();
    return t === "1" || t === "true" || t === "open";
  } catch (_) {
    return false;
  }
}

function initHowToPlay() {
  const dlg = document.getElementById("howto-dialog");
  const openBtn = document.getElementById("howto-open-btn");
  const closeBtn = document.getElementById("howto-close-btn");
  if (!dlg || !openBtn) return;
  const close = () => {
    try {
      dlg.close();
    } catch (_) {
      /* noop */
    }
  };
  openBtn.addEventListener("click", () => {
    if (typeof dlg.showModal === "function") dlg.showModal();
  });
  closeBtn?.addEventListener("click", close);
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) close();
  });
  if (
    shouldOpenHowtoFromQuery() &&
    !getPracticeModeCodeFromUrl() &&
    parseRoute().type === "home" &&
    typeof dlg.showModal === "function"
  ) {
    dlg.showModal();
    try {
      localStorage.setItem(HOWTO_STORAGE_KEY, "1");
    } catch (_) {
      /* noop */
    }
    return;
  }
  try {
    if (
      !getPracticeModeCodeFromUrl() &&
      parseRoute().type === "home" &&
      !localStorage.getItem(HOWTO_STORAGE_KEY) &&
      typeof dlg.showModal === "function"
    ) {
      dlg.showModal();
      localStorage.setItem(HOWTO_STORAGE_KEY, "1");
    }
  } catch (_) {
    /* localStorage unavailable: skip auto-open; manual `?` button still works */
  }
}

let gameControlsWired = false;
/** Bumped on each `renderRoute` entry; stale async completions must not repaint over a newer route. */
let renderRouteGeneration = 0;

function wireGameControlsOnce() {
  if (gameControlsWired) return;
  gameControlsWired = true;
  const practiceBtn = document.getElementById("home-practice-btn");
  if (!practiceBtn) {
    console.warn("[flaglette] #home-practice-btn not found — Practice Mode not wired.");
  } else {
    practiceBtn.addEventListener("click", () => {
      snapshotDailyProgressForResume();
      navigate("/practice");
    });
  }
  document.getElementById("practice-picker-back")?.addEventListener("click", () => {
    navigate("/");
  });
  document.getElementById("practice-exit-btn")?.addEventListener("click", () => {
    navigate("/practice");
  });
  document.getElementById("practice-next-btn")?.addEventListener("click", () => {
    onPracticeNextCountry();
  });
  document.getElementById("practice-change-continent-btn")?.addEventListener("click", () => {
    navigate("/practice");
  });
  document.getElementById("practice-exit-home-btn")?.addEventListener("click", () => {
    navigate("/");
  });

  const shareGameBtn = document.getElementById("share-btn-game");
  if (shareGameBtn) {
    shareGameBtn.onclick = () => openShareDialog();
  }
  document.getElementById("submit-btn")?.addEventListener("click", handleGuess);
  document.getElementById("guess-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleGuess();
    }
  });
}

/** Home `/`: daily complete gate, legacy `?play=`, or today’s puzzle. */
async function startHomeDailyGame(routeGen) {
  practiceRouteContinentKey = null;
  practiceModeCode = getPracticeModeCodeFromUrl();

  const gameZone = document.getElementById("game-zone");
  const dailyComplete = document.getElementById("daily-complete");
  const picker = document.getElementById("practice-picker-view");
  const practiceChrome = document.getElementById("practice-play-chrome");

  if (picker) picker.hidden = true;
  if (practiceChrome) practiceChrome.hidden = true;

  if (!practiceModeCode) {
    try {
      const raw = localStorage.getItem(getDailyStorageKey());
      if (raw) {
        const st = migrateDailyPayload(JSON.parse(raw));
        if (st && st.completed === true) {
          showDailyCompleteScreen(st);
          return;
        }
      }
    } catch (_) {
      /* new game */
    }
  }

  if (dailyComplete) dailyComplete.hidden = true;
  if (gameZone) gameZone.hidden = false;

  await ensureCountriesTerrain();
  if (routeGen !== renderRouteGeneration) return;
  const countries = allCountriesCache;
  const pool = countries.filter((c) => c.tier === "daily");
  if (pool.length === 0) {
    throw new Error('No country has tier "daily".');
  }

  removeLegacyPracticeBanner();

  let resumedDaily = false;
  if (practiceModeCode) {
    const found = countries.find((c) => c.code === practiceModeCode);
    if (!found) {
      throw new Error(`No country with code "${practiceModeCode}" in database.`);
    }
    currentCountry = found;
    const banner = document.createElement("p");
    banner.id = "legacy-practice-banner";
    banner.className = "play-mode-banner";
    banner.setAttribute("role", "status");
    banner.textContent = `Practice — ${found.name_en} (${found.code}). Daily save is off. Remove ?play= from the URL for the real puzzle.`;
    const flagDisplay = document.getElementById("flag-display");
    if (flagDisplay && gameZone) {
      gameZone.insertBefore(banner, flagDisplay);
    } else if (gameZone) {
      gameZone.insertBefore(banner, gameZone.firstChild);
    }
  } else {
    resumedDaily = consumeDailyResumeIfValid(countries);
    if (!resumedDaily) {
      currentCountry = getDailyCountry(pool);
    }
  }

  shareSnapshot = null;
  hideShareRow();
  clearMidnightCountdown();
  hidePracticeResultPanel();
  hidePracticeCycleToast();
  setPracticePlaySurfaceVisible(true);
  if (!resumedDaily || typeof gameStartedAt !== "number") {
    gameStartedAt = Date.now();
  }
  if (!resumedDaily && !practiceModeCode && !practiceRouteContinentKey) {
    trackEvent("game_started", { mode: "daily" });
  }

  clearFeedbackAnswerComment();
  renderFlagImage(currentCountry);
  updateAttemptsDisplay();
  if (!resumedDaily) clearHints();
  const feedback = document.getElementById("feedback");
  if (feedback) {
    feedback.textContent = "";
    feedback.className = "";
  }
  if (routeGen !== renderRouteGeneration) return;
  setInputsDisabled(false);
}

async function renderRoute() {
  const gen = ++renderRouteGeneration;
  const route = parseRoute();
  clearStatsAutoOpenTimer();

  const homeActions = document.getElementById("home-secondary-actions");
  const picker = document.getElementById("practice-picker-view");
  const gameZone = document.getElementById("game-zone");
  const dailyComplete = document.getElementById("daily-complete");
  const practiceChrome = document.getElementById("practice-play-chrome");

  if (route.type === "practice-picker") {
    practiceRouteContinentKey = null;
    clearMidnightCountdown();
    if (dailyComplete) dailyComplete.hidden = true;
    if (gameZone) gameZone.hidden = true;
    if (picker) picker.hidden = false;
    if (practiceChrome) practiceChrome.hidden = true;
    if (homeActions) homeActions.hidden = true;
    hidePracticeCycleToast();
    await ensureCountriesTerrain();
    if (gen !== renderRouteGeneration) return;
    renderPracticePickerList();
    trackPracticeEvent("practice_mode_entered", {});
    return;
  }

  if (route.type === "practice-play") {
    if (!isPracticeRouteKey(route.key)) {
      if (usesHashRouting()) {
        window.location.hash = "#/practice";
      } else {
        window.history.replaceState({}, "", "/practice");
        renderRoute().catch((err) => console.error(err));
      }
      return;
    }
    ensurePracticePlayHistoryStack(route.key);
    practiceRouteContinentKey = route.key;
    clearMidnightCountdown();
    if (dailyComplete) dailyComplete.hidden = true;
    if (picker) picker.hidden = true;
    if (gameZone) gameZone.hidden = false;
    if (practiceChrome) practiceChrome.hidden = false;
    if (homeActions) homeActions.hidden = true;
    await ensureCountriesTerrain();
    if (gen !== renderRouteGeneration) return;
    hideShareRow();
    hidePracticeResultPanel();
    setPracticeChromeLabel(route.key);
    startPracticeRoundFromRoute(route.key);
    return;
  }

  practiceRouteContinentKey = null;
  hidePracticeCycleToast();
  if (picker) picker.hidden = true;
  if (practiceChrome) practiceChrome.hidden = true;
  if (homeActions) homeActions.hidden = false;

  await startHomeDailyGame(gen);
}

function bootstrap() {
  injectSearchConsoleVerificationMeta();
  initShareDialog();
  initStatsDialog();
  initHowToPlay();
  initDevHelpers();
  wireGameControlsOnce();
  window.addEventListener("popstate", () => {
    renderRoute().catch((err) => console.error(err));
  });
  window.addEventListener("hashchange", () => {
    if (usesHashRouting()) {
      renderRoute().catch((err) => console.error(err));
    }
  });
  renderRoute().catch((err) => console.error(err));
}

bootstrap();
