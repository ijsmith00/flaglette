let currentCountry = null;
let attempts = 0;
const maxAttempts = 3;
let isGameOver = false;
/** 공유 텍스트용 — persist 직후·완료 화면 복원 시 채움 */
let shareSnapshot = null;

/** V1.1 연습 모드용 — 목록에서 무작위 국가 (현재 미사용) */
function pickRandomCountry(countries) {
  const i = Math.floor(Math.random() * countries.length);
  return countries[i];
}

/** 로컬 기준 오늘 날짜 문자열 YYYYMMDD (저장 키용) */
function getLocalDateKeyString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** YYYYMMDD 정수 — 같은 날이면 항상 같은 시드 */
function getLocalDateSeedNumber() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** localStorage 키: flaglette_daily_YYYYMMDD */
function getDailyStorageKey() {
  return `flaglette_daily_${getLocalDateKeyString()}`;
}

/**
 * 데일리 정답: 오늘 날짜(로컬)를 숫자로 → % 풀 길이.
 * @param {object[]} coreCountries tier === "core" 배열
 */
function getDailyCountry(coreCountries) {
  const n = getLocalDateSeedNumber();
  const idx = n % coreCountries.length;
  return coreCountries[idx];
}

/** RGB 거리로 가장 가까운 색 이모지 (Wordle 스타일 공유용) */
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

/** HEX 색 문자열 → {r,g,b} */
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

/** 공유용: 국기 색에 가장 가까운 사각 이모지 */
function colorToEmoji(hexColor) {
  const rgb = hexToRgb(hexColor);
  const { r, g, b } = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const spread = max - min;

  // 거의 흰색
  if (min > 238 && spread < 22) {
    return "⬜";
  }
  /* 짙은 남색·네이비(#241D4F 등): RGB 거리상 ⬛에 붙는 오분류 방지 — 파랑 성분이 크면 🟦 */
  if (b > r && b > g && b > 48 && r < 130 && g < 130) {
    return "🟦";
  }
  // 짙은 녹색·올리브
  if (g > r && g > b && g > 52 && r < 140 && b < 140) {
    return "🟩";
  }
  // 짙은 적색·자주
  if (r > g && r > b && r > 72 && g < 130 && b < 130) {
    return "🟥";
  }
  // 거의 순검·중성 어두운 회색
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

/** 기준일 2026-01-01(로컬)부터의 일수 + 1 */
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

/** 오늘 날짜 키의 localStorage에서 공유 스냅샷 복원 */
function loadShareSnapshotFromStorage() {
  try {
    const raw = localStorage.getItem(getDailyStorageKey());
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || !p.completed) return null;
    return {
      won: p.won,
      attempts: p.attempts,
      hintsUsed: p.hintsUsed ?? 0,
      stripeEmojiLine: p.stripeEmojiLine || "",
    };
  } catch (_) {
    return null;
  }
}

/** https 페이지에서만 — 소셜 공유·페이스북 u 파라미터용 */
function getSharePageUrl() {
  try {
    const { protocol, host, pathname } = window.location;
    if (protocol !== "http:" && protocol !== "https:") return "";
    return `${protocol}//${host}${pathname}`;
  } catch (_) {
    return "";
  }
}

/** 클립보드에 넣을 Wordle 스타일 결과 문자열 */
function generateShareText() {
  const snap = shareSnapshot || loadShareSnapshotFromStorage();
  if (!snap) return "";
  const n = getDailyGameNumber();
  const resultEmoji = snap.won ? "✅" : "❌";
  const stripeLine = snap.stripeEmojiLine || "";
  const hintSuffix = snap.hintsUsed > 0 ? " 💡" : "";
  const body = `Flaglette #${n} 🌍 ${resultEmoji}\n\n${stripeLine}\n\nGuesses ${snap.attempts}/3${hintSuffix}`;
  const pageUrl = getSharePageUrl();
  return pageUrl ? `${body}\n\n${pageUrl}\n` : `${body}\n\n`;
}

/** 게임 종료 직후 인라인 공유 버튼 표시 */
function showShareRow() {
  const row = document.getElementById("share-row");
  if (row) row.hidden = false;
}

/** 인라인 공유 버튼 숨김 (새 판 시작 시) */
function hideShareRow() {
  const row = document.getElementById("share-row");
  if (row) row.hidden = true;
}

/** 공유 문자열을 클립보드에 복사 (성공 여부) */
async function copyShareTextToClipboard() {
  const text = generateShareText();
  if (!text.trim()) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    console.warn("클립보드 복사 실패", e);
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

/** 공유 다이얼로그: 인스타·틱톡 등은 웹에서 직접 글 게시 API가 없어 복사 후 앱/사이트로 연결 */
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

/** 공유 텍스트를 클립보드에 복사하고 버튼 라벨 잠깐 변경 */
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

/** 로컬 자정까지 남은 시간(ms) */
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

/** 완료 화면 자정 카운트다운 interval 정리 */
function clearMidnightCountdown() {
  if (midnightCountdownTimerId != null) {
    clearInterval(midnightCountdownTimerId);
    midnightCountdownTimerId = null;
  }
}

/** 초 길이를 HH:MM:SS 문자열로 */
function formatCountdownHMS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** 완료 패널: 다음 자정까지 HH:MM:SS */
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

/** 정답/실패 시 오늘 날짜 키로 진행 저장 (총 시도·힌트 단계 수·줄무늬 이모지) */
function persistDailyComplete(won) {
  const totalAttempts = won ? attempts + 1 : maxAttempts;
  const hintsUsed = won ? attempts : maxAttempts;
  const stripeEmojiLine = currentCountry.stripes.bands
    .map((b) => colorToEmoji(b.color))
    .join("");
  shareSnapshot = {
    won,
    attempts: totalAttempts,
    hintsUsed,
    stripeEmojiLine,
  };
  const payload = {
    completed: true,
    won,
    attempts: totalAttempts,
    hintsUsed,
    stripeEmojiLine,
  };
  try {
    localStorage.setItem(getDailyStorageKey(), JSON.stringify(payload));
  } catch (e) {
    console.warn("localStorage 저장 실패", e);
  }
}

/** 이미 완료한 오늘 판 — 완료 카드만 표시 */
function showDailyCompleteScreen(saved) {
  const gameZone = document.getElementById("game-zone");
  const panel = document.getElementById("daily-complete");
  const label = document.getElementById("daily-result-label");
  const att = document.getElementById("daily-result-attempts");
  shareSnapshot = {
    won: saved.won,
    attempts: saved.attempts,
    hintsUsed: saved.hintsUsed ?? 0,
    stripeEmojiLine: saved.stripeEmojiLine || "",
  };
  if (gameZone) gameZone.hidden = true;
  if (panel) panel.hidden = false;
  if (label) label.textContent = saved.won ? "Solved" : "Failed";
  if (att) att.textContent = String(saved.attempts ?? "—");
  const shareDaily = document.getElementById("share-btn-daily");
  if (shareDaily) {
    shareDaily.onclick = () => openShareDialog();
  }
  startMidnightCountdown();
}

/** 정답 비교용 문자열 정규화 */
function normalize(str) {
  return str.trim().toLowerCase();
}

/** 영문 국가명과 일치하면 정답 (V1.1에서 한글 인정 예정) */
function isCorrectGuess(guess, country) {
  const g = normalize(guess);
  return g === normalize(country.name_en);
}

const NS = "http://www.w3.org/2000/svg";

/** 건·곤·감·이 — 막대 3줄 (실선 / 절선). 좌표는 괘 박스 왼쪽 위 기준. */
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

/** 괘 막대 3줄 — 가운데 끊긴(절선) 패턴 */
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

/** 괘 막대 3줄 — 행마다 실선/절선 혼합 */
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
 * 흰 바탕 + SVG 태극(음양 곡선·소원) + 사괘. 비율은 상징적 단순화.
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

/** 성조기 단순화: 13줄 빨/흰 번갈아 + 좌상단 청색 canton(너비 약 40%, 높이 위쪽 7/13). 별은 생략. */
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

/** 배경(bands[0]) + 동심원(bands[1]…). 바깥 원 지름 ≈ 프레임 높이의 40%. */
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

/** country.stripes에 맞춰 #flag-display에 국기 프레임 렌더 */
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
    console.warn("아직 처리 안 된 direction:", direction);
    frame.style.backgroundColor = bands[0] ? bands[0].color : "#333333";
  }

  display.appendChild(frame);
}

/** #attempts 텍스트 갱신 */
function updateAttemptsDisplay() {
  document.getElementById("attempts").textContent =
    `Guesses: ${attempts} / ${maxAttempts}`;
}

/** 힌트 영역 비우기 */
function clearHints() {
  const el = document.getElementById("hints");
  if (el) el.innerHTML = "";
}

/** 힌트 한 줄 추가 (누적) */
function appendHintLine(text) {
  const root = document.getElementById("hints");
  if (!root) return;
  const line = document.createElement("div");
  line.className = "hint-line";
  line.textContent = text;
  root.appendChild(line);
}

/** 입력·확인 버튼 활성/비활성 */
function setInputsDisabled(disabled) {
  document.getElementById("guess-input").disabled = disabled;
  document.getElementById("submit-btn").disabled = disabled;
}

/** 추측 제출: 정답·오답·힌트·데일리 저장·공유 버튼 */
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
      `💡 Population: ${currentCountry.population_en ?? currentCountry.population}`
    );
  } else if (attempts === 2) {
    appendHintLine(
      `💡 Borders: ${(currentCountry.neighbors_en ?? currentCountry.neighbors).join(", ")}`
    );
  } else if (attempts === 3) {
    appendHintLine(`💡 Starts with ${currentCountry.first_letter_en}`);
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

/** #countries-embedded 또는 countries.json에서 데이터 로드 */
async function loadCountries() {
  const embedded = document.getElementById("countries-embedded");

  if (window.location.protocol === "file:") {
    if (!embedded) {
      throw new Error("file:// 에서는 #countries-embedded 가 필요합니다.");
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

/** 페이지 로드: 오늘 완료 여부 → 데일리 국가 선정·이벤트 연결 */
async function init() {
  initShareDialog();
  /* await 전에 동기 확인 — 완료 시 게임 영역이 잠깐이라도 보이지 않게 */
  try {
    const raw = localStorage.getItem(getDailyStorageKey());
    if (raw) {
      const st = JSON.parse(raw);
      if (st && st.completed === true) {
        showDailyCompleteScreen(st);
        return;
      }
    }
  } catch (_) {
    /* 새 게임 */
  }

  const gameZone = document.getElementById("game-zone");
  if (gameZone) gameZone.hidden = false;

  const countries = await loadCountries();
  const pool = countries.filter((c) => c.tier === "core");
  if (pool.length === 0) {
    throw new Error("tier가 core인 나라가 없습니다.");
  }

  // currentCountry = pickRandomCountry(pool);
  // V1.1에서 연습 모드용 랜덤 — 위 pickRandomCountry(pool) 사용
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
