let currentCountry = null;
let attempts = 0;
const maxAttempts = 6;
const SAVE_SCHEMA_VERSION = 2;
const HOWTO_STORAGE_KEY = "flaglette_howto_seen_v1";
let isGameOver = false;
/** Filled after persist and when restoring the complete screen for share text. */
let shareSnapshot = null;

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
 * @param {object[]} coreCountries countries with tier === "core"
 */
function getDailyCountry(coreCountries) {
  const n = getLocalDateSeedNumber();
  const idx = n % coreCountries.length;
  return coreCountries[idx];
}

/** Nearest square emoji by RGB distance (Wordle-style share). */
const EMOJI_RGB_ANCHORS = [
  ["🟥", 255, 0, 0],
  ["🟧", 255, 165, 0],
  ["🟨", 255, 255, 0],
  ["🟩", 0, 128, 0],
  ["🟦", 0, 0, 255],
  ["🟪", 128, 0, 128],
  ["⬜", 255, 255, 255],
  ["⬛", 0, 0, 0],
  ["🟫", 139, 69, 19],
];

/** HEX string → {r,g,b} */
function hexToRgb(hex) {
  if (typeof hex !== "string") return { r: 128, g: 128, b: 128 };
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  if (h.length !== 6) return { r: 128, g: 128, b: 128 };
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return { r: 128, g: 128, b: 128 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Share: square emoji closest to flag color. */
function colorToEmoji(hexColor) {
  const rgb = hexToRgb(hexColor);
  const { r, g, b } = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const spread = max - min;

  // Near white
  if (min > 238 && spread < 22) {
    return "⬜";
  }
  /* Dark navy (#241D4F etc.): avoid misclassifying as black when blue dominates */
  if (b > r && b > g && b > 48 && r < 130 && g < 130) {
    return "🟦";
  }
  // Dark green / olive
  if (g > r && g > b && g > 52 && r < 140 && b < 140) {
    return "🟩";
  }
  // Dark red / maroon
  if (r > g && r > b && r > 72 && g < 130 && b < 130) {
    return "🟥";
  }
  // Near black / neutral dark gray
  if (max < 52 && spread < 28) {
    return "⬛";
  }

  let best = EMOJI_RGB_ANCHORS[0];
  let bestD = Infinity;
  for (const row of EMOJI_RGB_ANCHORS) {
    const dr = rgb.r - row[1];
    const dg = rgb.g - row[2];
    const db = rgb.b - row[3];
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) {
      bestD = d;
      best = row;
    }
  }
  return best[0];
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

/** Legacy save (3 guesses): normalize maxGuesses and schemaVersion */
function migrateDailyPayload(p) {
  if (!p || typeof p !== "object") return p;
  const maxGuesses = p.maxGuesses ?? (p.schemaVersion >= 2 ? 6 : 3);
  return { ...p, maxGuesses, schemaVersion: p.schemaVersion ?? 1 };
}

/** Letter count of English country name (spaces excluded) */
function letterCountFromName(nameEn) {
  return String(nameEn || "").replace(/\s/g, "").length;
}

/** Neighboring countries hint line (English only). */
function formatNeighborsHint(country) {
  const n = country.neighbors_en ?? [];
  if (n.length === 0) return "No bordering countries";
  const joined = n.join(", ");
  if (joined === "Island nation") {
    return "Island nation (no land borders)";
  }
  return joined;
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
      stripeEmojiLine: p.stripeEmojiLine || "",
    };
  } catch (_) {
    return null;
  }
}

/** Only on http(s) — social share / Facebook u parameter */
function getSharePageUrl() {
  try {
    const { protocol, host, pathname } = window.location;
    if (protocol !== "http:" && protocol !== "https:") return "";
    return `${protocol}//${host}${pathname}`;
  } catch (_) {
    return "";
  }
}

/** Wordle-style result string for the clipboard */
function generateShareText() {
  const snap = shareSnapshot || loadShareSnapshotFromStorage();
  if (!snap) return "";
  const n = getDailyGameNumber();
  const resultEmoji = snap.won ? "✅" : "❌";
  const stripeLine = snap.stripeEmojiLine || "";
  const maxG = snap.maxGuesses ?? 3;
  const totalAttempts = snap.attempts;
  const hintSuffix = snap.hintsUsed > 0 ? " 💡" : "";
  const line1 = `Flaglette #${n} ${totalAttempts}/${maxG} ${resultEmoji}`;
  const body = `${line1}\n\n${stripeLine}${hintSuffix}\n`;
  const pageUrl = getSharePageUrl();
  return pageUrl ? `${body}\n\n${pageUrl}\n` : `${body}\n\n`;
}

/** Show inline share row right after the game ends */
function showShareRow() {
  const row = document.getElementById("share-row");
  if (row) row.hidden = false;
}

/** Hide inline share row (e.g. when starting a new round) */
function hideShareRow() {
  const row = document.getElementById("share-row");
  if (row) row.hidden = true;
}

/** Copy share string to clipboard; returns success */
async function copyShareTextToClipboard() {
  const text = generateShareText();
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
  const text = generateShareText();
  if (!text.trim()) return;
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
  const pageUrl = getSharePageUrl() || window.location.href.split("#")[0];
  const text = generateShareText();
  const u = encodeURIComponent(pageUrl);
  const quote = encodeURIComponent(text.replace(/\s+/g, " ").trim().slice(0, 500));
  const url = `https://www.facebook.com/sharer/sharer.php?u=${u}&quote=${quote}`;
  window.open(url, "_blank", "noopener,noreferrer");
  setShareDialogStatus("Facebook share window opened.");
}

function shareToXFromDialog() {
  const text = generateShareText();
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
  const text = generateShareText();
  const url = getSharePageUrl() || undefined;
  if (!navigator.share) {
    setShareDialogStatus("Sharing is not available in this browser.");
    return;
  }
  try {
    const payload = url ? { title: "Flaglette", text, url } : { title: "Flaglette", text };
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
    webBtn.hidden = !(
      typeof navigator !== "undefined" && typeof navigator.share === "function"
    );
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

/** Clear midnight countdown interval on complete screen */
function clearMidnightCountdown() {
  if (midnightCountdownTimerId != null) {
    clearInterval(midnightCountdownTimerId);
    midnightCountdownTimerId = null;
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

/** Complete panel: countdown to next midnight */
function startMidnightCountdown() {
  clearMidnightCountdown();
  const el = document.getElementById("daily-countdown");
  const note = document.getElementById("daily-midnight-note");
  if (!el) return;
  const tick = () => {
    const ms = msUntilNextLocalMidnight();
    if (ms <= 0) {
      el.textContent = "00:00:00";
      if (note) {
        note.textContent =
          "Refresh the page to play the new daily puzzle.";
        note.hidden = false;
      }
      clearMidnightCountdown();
      return;
    }
    el.textContent = formatCountdownHMS(ms / 1000);
  };
  tick();
  midnightCountdownTimerId = setInterval(tick, 1000);
}

/** Save progress for today’s key on win/loss (attempts, hints, stripe emojis) */
function persistDailyComplete(won) {
  const totalAttempts = won ? attempts + 1 : maxAttempts;
  const wrongBeforeEnd = won ? attempts : maxAttempts;
  const hintsUsed = won ? Math.min(wrongBeforeEnd, 5) : 5;
  const stripeEmojiLine = currentCountry.stripes.bands
    .map((b) => colorToEmoji(b.color))
    .join("");
  shareSnapshot = {
    won,
    attempts: totalAttempts,
    hintsUsed,
    maxGuesses: maxAttempts,
    stripeEmojiLine,
  };
  const payload = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    completed: true,
    won,
    attempts: totalAttempts,
    maxGuesses: maxAttempts,
    hintsUsed,
    stripeEmojiLine,
  };
  try {
    localStorage.setItem(getDailyStorageKey(), JSON.stringify(payload));
  } catch (e) {
    console.warn("localStorage save failed", e);
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
    stripeEmojiLine: saved.stripeEmojiLine || "",
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
  startMidnightCountdown();
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

const NS = "http://www.w3.org/2000/svg";

/** Trigram bars: three rows (solid / broken). Origin: top-left of trigram box. */
function appendGwaeSolid(g, x, y, w, barH, gap) {
  for (let i = 0; i < 3; i++) {
    const r = document.createElementNS(NS, "rect");
    r.setAttribute("x", String(x));
    r.setAttribute("y", String(y + i * (barH + gap)));
    r.setAttribute("width", String(w));
    r.setAttribute("height", String(barH));
    r.setAttribute("fill", "#000000");
    g.appendChild(r);
  }
}

/** Three broken bars (center gap) */
function appendGwaeBroken(g, x, y, w, barH, gap, midGap) {
  const half = (w - midGap) / 2;
  for (let i = 0; i < 3; i++) {
    const yy = y + i * (barH + gap);
    const a = document.createElementNS(NS, "rect");
    a.setAttribute("x", String(x));
    a.setAttribute("y", String(yy));
    a.setAttribute("width", String(half));
    a.setAttribute("height", String(barH));
    a.setAttribute("fill", "#000000");
    const b = document.createElementNS(NS, "rect");
    b.setAttribute("x", String(x + half + midGap));
    b.setAttribute("y", String(yy));
    b.setAttribute("width", String(half));
    b.setAttribute("height", String(barH));
    b.setAttribute("fill", "#000000");
    g.appendChild(a);
    g.appendChild(b);
  }
}

/** Three rows mixing solid and broken bars */
function appendGwaeMixed(g, x, y, w, barH, gap, midGap, pattern) {
  const half = (w - midGap) / 2;
  for (let row = 0; row < 3; row++) {
    const yy = y + row * (barH + gap);
    if (pattern[row] === "y") {
      const r = document.createElementNS(NS, "rect");
      r.setAttribute("x", String(x));
      r.setAttribute("y", String(yy));
      r.setAttribute("width", String(w));
      r.setAttribute("height", String(barH));
      r.setAttribute("fill", "#000000");
      g.appendChild(r);
    } else {
      const a = document.createElementNS(NS, "rect");
      a.setAttribute("x", String(x));
      a.setAttribute("y", String(yy));
      a.setAttribute("width", String(half));
      a.setAttribute("height", String(barH));
      a.setAttribute("fill", "#000000");
      const b = document.createElementNS(NS, "rect");
      b.setAttribute("x", String(x + half + midGap));
      b.setAttribute("y", String(yy));
      b.setAttribute("width", String(half));
      b.setAttribute("height", String(barH));
      b.setAttribute("fill", "#000000");
      g.appendChild(a);
      g.appendChild(b);
    }
  }
}

/**
 * White field + SVG taegeuk (yin-yang) + four trigrams. Proportions are symbolic.
 */
function renderSouthKoreaStripes(frame) {
  frame.style.backgroundColor = "#FFFFFF";
  frame.style.position = "relative";

  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 300 200");
  svg.setAttribute("xmlns", NS);
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText =
    "position:absolute;left:0;top:0;width:100%;height:100%;display:block;";

  const blue = "#0047A0";
  const red = "#CD2E3A";

  const gTg = document.createElementNS(NS, "g");
  gTg.setAttribute(
    "transform",
    "translate(150,100) scale(0.72) translate(-50,-50)"
  );

  const pBlue = document.createElementNS(NS, "path");
  pBlue.setAttribute("fill", blue);
  pBlue.setAttribute(
    "d",
    "M50,0 A50,50 0 0,0 50,100 A25,25 0 0,1 50,0 Z"
  );

  const pRed = document.createElementNS(NS, "path");
  pRed.setAttribute("fill", red);
  pRed.setAttribute(
    "d",
    "M50,100 A50,50 0 0,0 50,0 A25,25 0 0,0 50,100 Z"
  );

  const eyeBlue = document.createElementNS(NS, "circle");
  eyeBlue.setAttribute("cx", "50");
  eyeBlue.setAttribute("cy", "25");
  eyeBlue.setAttribute("r", "12.5");
  eyeBlue.setAttribute("fill", blue);

  const eyeRed = document.createElementNS(NS, "circle");
  eyeRed.setAttribute("cx", "50");
  eyeRed.setAttribute("cy", "75");
  eyeRed.setAttribute("r", "12.5");
  eyeRed.setAttribute("fill", red);

  gTg.appendChild(pBlue);
  gTg.appendChild(pRed);
  gTg.appendChild(eyeBlue);
  gTg.appendChild(eyeRed);

  const gw = 30;
  const bh = 4;
  const gsp = 3;
  const mg = 4;

  const gGw = document.createElementNS(NS, "g");
  gGw.setAttribute("fill", "#000000");
  appendGwaeSolid(gGw, 22, 20, gw, bh, gsp);
  appendGwaeBroken(gGw, 300 - 22 - gw, 20, gw, bh, gsp, mg);
  appendGwaeMixed(gGw, 22, 200 - 20 - (3 * bh + 2 * gsp), gw, bh, gsp, mg, [
    "n",
    "y",
    "n",
  ]);
  appendGwaeMixed(gGw, 300 - 22 - gw, 200 - 20 - (3 * bh + 2 * gsp), gw, bh, gsp, mg, [
    "y",
    "n",
    "y",
  ]);

  svg.appendChild(gTg);
  svg.appendChild(gGw);
  frame.appendChild(svg);
}

/** Simplified US flag: 13 red/white stripes + blue canton (~40% wide, top 7/13). Stars omitted. */
function renderUnitedStatesStripes(frame) {
  const red = "#B22234";
  const white = "#FFFFFF";
  const blue = "#3C3B6E";
  for (let i = 0; i < 13; i++) {
    const seg = document.createElement("div");
    seg.style.flex = "1 1 0";
    seg.style.minHeight = "0";
    seg.style.width = "100%";
    seg.style.backgroundColor = i % 2 === 0 ? red : white;
    frame.appendChild(seg);
  }
  const canton = document.createElement("div");
  canton.style.position = "absolute";
  canton.style.left = "0";
  canton.style.top = "0";
  canton.style.width = "40%";
  canton.style.height = `${(7 / 13) * 100}%`;
  canton.style.backgroundColor = blue;
  frame.appendChild(canton);
}

/** Background (bands[0]) + concentric circles (bands[1]…). Outer circle ~40% of frame height. */
function renderCenterStripes(frame, bands) {
  frame.style.backgroundColor = bands[0].color;
  if (bands.length < 2) return;

  let parent = frame;
  for (let i = 1; i < bands.length; i++) {
    const circle = document.createElement("div");
    circle.style.borderRadius = "50%";
    circle.style.backgroundColor = bands[i].color;
    circle.style.boxSizing = "border-box";
    circle.style.display = "flex";
    circle.style.alignItems = "center";
    circle.style.justifyContent = "center";
    if (i === 1) {
      circle.style.position = "absolute";
      circle.style.height = "40%";
      circle.style.aspectRatio = "1";
      circle.style.width = "auto";
      circle.style.left = "50%";
      circle.style.top = "50%";
      circle.style.transform = "translate(-50%, -50%)";
    } else {
      circle.style.width = "50%";
      circle.style.height = "50%";
      circle.style.flexShrink = "0";
      circle.style.minWidth = "0";
      circle.style.minHeight = "0";
    }
    parent.appendChild(circle);
    parent = circle;
  }
}

/** Render flag frame in #flag-display from country.stripes */
function renderStripes(country) {
  const display = document.getElementById("flag-display");
  display.innerHTML = "";

  const { direction, bands } = country.stripes;

  const frame = document.createElement("div");
  frame.style.width = "400px";
  frame.style.maxWidth = "100%";
  if (country.code === "LV") {
    frame.style.height = "200px";
  } else {
    frame.style.height = "250px";
  }
  frame.style.margin = "0 auto";
  frame.style.borderRadius = "8px";
  frame.style.overflow = "hidden";
  frame.style.boxShadow = "0 6px 22px rgba(0, 0, 0, 0.4)";

  if (direction === "vertical") {
    frame.style.display = "flex";
    frame.style.flexDirection = "row";
    for (const band of bands) {
      const seg = document.createElement("div");
      seg.style.flex = `0 0 ${band.ratio}%`;
      seg.style.height = "100%";
      seg.style.backgroundColor = band.color;
      frame.appendChild(seg);
    }
  } else if (direction === "horizontal") {
    frame.style.display = "flex";
    frame.style.flexDirection = "column";
    if (country.code === "US") {
      frame.style.position = "relative";
      renderUnitedStatesStripes(frame);
    } else {
      for (const band of bands) {
        const seg = document.createElement("div");
        seg.style.flex = `0 0 ${band.ratio}%`;
        seg.style.width = "100%";
        seg.style.backgroundColor = band.color;
        frame.appendChild(seg);
      }
    }
  } else if (direction === "center") {
    frame.style.display = "block";
    frame.style.position = "relative";
    if (country.code === "KR") {
      renderSouthKoreaStripes(frame);
    } else {
      renderCenterStripes(frame, bands);
    }
  } else {
    frame.style.display = "block";
    console.warn("Unimplemented stripes direction:", direction);
    frame.style.backgroundColor = bands[0] ? bands[0].color : "#333333";
  }

  display.appendChild(frame);
}

/** Update #attempts label */
function updateAttemptsDisplay() {
  document.getElementById("attempts").textContent =
    `Guesses: ${attempts} / ${maxAttempts}`;
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
    persistDailyComplete(true);
    showShareRow();
    return;
  }

  attempts += 1;
  updateAttemptsDisplay();

  if (attempts === 1) {
    appendHintLine(
      `Population: ${currentCountry.population_en ?? "—"}`
    );
  } else if (attempts === 2) {
    appendHintLine(`Neighboring countries: ${formatNeighborsHint(currentCountry)}`);
  } else if (attempts === 3) {
    appendHintLine(`Continent: ${currentCountry.continent ?? "—"}`);
  } else if (attempts === 4) {
    appendHintLine(`Starts with: ${currentCountry.first_letter_en}`);
  } else if (attempts === 5) {
    appendHintLine(
      `Name length (letters): ${letterCountFromName(currentCountry.name_en)}`
    );
  } else if (attempts === 6) {
    feedback.textContent = `Game over. The answer was ${currentCountry.name_en}.`;
    feedback.className = "feedback-error";
    isGameOver = true;
    setInputsDisabled(true);
    input.value = "";
    persistDailyComplete(false);
    showShareRow();
    return;
  }

  feedback.textContent = "Not quite. Try again!";
  feedback.className = "feedback-error";
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
  try {
    if (!localStorage.getItem(HOWTO_STORAGE_KEY) && typeof dlg.showModal === "function") {
      dlg.showModal();
      localStorage.setItem(HOWTO_STORAGE_KEY, "1");
    }
  } catch (_) {
    if (typeof dlg.showModal === "function") dlg.showModal();
  }
}

/** Page load: if today not done, pick daily country and wire events */
async function init() {
  initShareDialog();
  initHowToPlay();
  /* Sync check before await — avoid flashing game zone if already complete */
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

  const gameZone = document.getElementById("game-zone");
  if (gameZone) gameZone.hidden = false;

  const countries = await loadCountries();
  const pool = countries.filter((c) => c.tier === "core");
  if (pool.length === 0) {
    throw new Error('No country has tier "core".');
  }

  // currentCountry = pickRandomCountry(pool);
  // V1.1 practice mode could use pickRandomCountry(pool) here
  currentCountry = getDailyCountry(pool);

  shareSnapshot = null;
  hideShareRow();

  renderStripes(currentCountry);
  updateAttemptsDisplay();
  clearHints();

  const guessInput = document.getElementById("guess-input");
  const shareGameBtn = document.getElementById("share-btn-game");
  if (shareGameBtn) {
    shareGameBtn.onclick = () => openShareDialog();
  }
  document.getElementById("submit-btn").addEventListener("click", handleGuess);
  guessInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleGuess();
    }
  });
}

init().catch((err) => {
  console.error(err);
});
