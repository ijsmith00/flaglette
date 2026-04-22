/**
 * Build countries.json: UN 193 (API unMember + GW) + TW HK PS XK VA PR GL = 200.
 * Preserves stripes/palette/name/population text from data/flags.backup.json for legacy codes.
 *
 * Usage: node scripts/generate-countries-database.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const backupPath = path.join(root, "data", "flags.backup.json");
const outPath = path.join(root, "countries.json");
const reportPath = path.join(root, "data", "countries-generation-report.json");

const LEGACY_CODES = new Set([
  "JP",
  "US",
  "FR",
  "DE",
  "IT",
  "NL",
  "BE",
  "AT",
  "RU",
  "UA",
  "PL",
  "CO",
  "TH",
  "HU",
  "GA",
  "ID",
  "IE",
  "MC",
  "YE",
  "NG",
  "ML",
  "EE",
  "LU",
  "LV",
  "LT",
  "TD",
  "GN",
  "CI",
  "MU",
  "CR",
]);

const EXTRA_CODES = ["TW", "HK", "PS", "XK", "VA", "PR", "GL"];

function continentLabel(c) {
  const arr = c?.continents;
  if (!arr?.length) return "—";
  const x = arr[0];
  if (x === "Antarctica") return "Antarctica";
  if (x === "Africa") return "Africa";
  if (x === "Asia") return "Asia";
  if (x === "Europe") return "Europe";
  if (x === "Oceania") return "Oceania";
  if (x === "North America") return "North America";
  if (x === "South America") return "South America";
  return x;
}

function formatPopulationDisplay(pop) {
  const n = Number(pop);
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n >= 1e9) return `~${(n / 1e9).toFixed(2).replace(/\.?0+$/, "")} billion`;
  if (n >= 1e6) return `~${(n / 1e6).toFixed(1)} million`;
  if (n >= 1e3) return `~${Math.round(n / 1e3)} thousand`;
  return `~${n}`;
}

function letterCount(nameEn) {
  return String(nameEn || "").replace(/\s/g, "").length;
}

function firstLetterEn(nameEn) {
  const s = String(nameEn || "").trim();
  if (!s) return "?";
  const ch = [...s][0];
  return ch.toUpperCase();
}

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    const x = Math.round(c * 255);
    return x.toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function hashHue(code) {
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

function syntheticStripesFromCode(code) {
  const h = hashHue(code);
  const c1 = hslToHex(h % 360, 70, 42);
  const c2 = hslToHex((h * 7) % 360, 65, 38);
  const c3 = hslToHex((h * 13) % 360, 60, 44);
  const bands = [
    { color: c1, ratio: 34 },
    { color: c2, ratio: 33 },
    { color: c3, ratio: 33 },
  ];
  return {
    stripes: { direction: "horizontal", bands },
    palette: bands.map((b) => ({ color: b.color, ratio: b.ratio })),
    stripesTodo: true,
  };
}

async function loadBackup() {
  const raw = fs.readFileSync(backupPath, "utf8");
  const arr = JSON.parse(raw);
  const byCode = Object.create(null);
  for (const c of arr) {
    if (c?.code) byCode[c.code] = c;
  }
  return byCode;
}

async function fetchAll() {
  const fields = [
    "name",
    "cca2",
    "cca3",
    "borders",
    "population",
    "continents",
    "unMember",
  ].join(",");
  const res = await fetch(
    `https://restcountries.com/v3.1/all?fields=${fields}`
  );
  if (!res.ok) throw new Error(`REST Countries HTTP ${res.status}`);
  return res.json();
}

function buildTargetCodes(api) {
  const un = api.filter((c) => c.unMember === true).map((c) => c.cca2);
  const set = new Set(un);
  const gw = api.find((c) => c.cca2 === "GW");
  if (gw && !set.has("GW")) set.add("GW");
  for (const x of EXTRA_CODES) set.add(x);
  return [...set];
}

function indexByCca2(api) {
  const m = Object.create(null);
  for (const c of api) {
    if (c.cca2) m[c.cca2] = c;
  }
  return m;
}

function indexCca3ToName(api) {
  const m = Object.create(null);
  for (const c of api) {
    if (c.cca3) m[c.cca3] = c.name?.common ?? c.cca3;
  }
  return m;
}

function neighborNames(c, cca3ToName) {
  const borders = c.borders;
  if (!Array.isArray(borders) || borders.length === 0) return [];
  return borders.map((b) => cca3ToName[b] || b).sort((a, b) => a.localeCompare(b));
}

async function checkFlagcdn(code) {
  const url = `https://flagcdn.com/w640/${code.toLowerCase()}.png`;
  try {
    const r = await fetch(url, { method: "HEAD", redirect: "follow" });
    return { code, url, ok: r.ok, status: r.status };
  } catch (e) {
    return { code, url, ok: false, status: 0, error: String(e?.message || e) };
  }
}

function tierFromDifficulty(d) {
  return d <= 3 ? "daily" : "archive";
}

async function main() {
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Missing backup: ${backupPath}`);
  }

  const backupByCode = await loadBackup();
  const api = await fetchAll();
  const byCca2 = indexByCca2(api);
  const cca3ToName = indexCca3ToName(api);

  const targetCodes = buildTargetCodes(api);
  if (targetCodes.length !== 200) {
    console.warn("Expected 200 target codes, got", targetCodes.length);
  }

  const missing = targetCodes.filter((cc) => !byCca2[cc]);
  if (missing.length) {
    throw new Error(`Missing API entries for: ${missing.join(", ")}`);
  }

  const nonLegacy = targetCodes.filter((c) => !LEGACY_CODES.has(c)).sort();
  const restWithPop = nonLegacy.map((code) => ({
    code,
    population: byCca2[code].population ?? 0,
  }));
  restWithPop.sort((a, b) => b.population - a.population);

  const difficultyByCode = Object.create(null);
  for (const c of LEGACY_CODES) difficultyByCode[c] = 1;

  for (let i = 0; i < restWithPop.length; i++) {
    const { code } = restWithPop[i];
    let d;
    if (i < 40) d = 2;
    else if (i < 90) d = 3;
    else if (i < 140) d = 4;
    else d = 5;
    difficultyByCode[code] = d;
  }

  const out = [];

  for (const code of [...targetCodes].sort()) {
    const apiRow = byCca2[code];
    const nameEn = apiRow.name?.common ?? code;
    const nb = neighborNames(apiRow, cca3ToName);
    const popNum = apiRow.population ?? 0;
    const popDisp = formatPopulationDisplay(popNum);
    const diff = difficultyByCode[code];
    const legacy = backupByCode[code];

    const row = {
      code,
      name_ko: nameEn,
      name_en: nameEn,
      population: popDisp,
      population_en: popDisp,
      populationNumber: popNum,
      populationDisplay: popDisp,
      neighbors: [...nb],
      neighbors_en: [...nb],
      first_letter_ko: firstLetterEn(nameEn),
      first_letter_en: firstLetterEn(nameEn),
      letterCount: letterCount(nameEn),
      flagUrl: `https://flagcdn.com/w640/${code.toLowerCase()}.png`,
      continent: continentLabel(apiRow),
      difficulty: diff,
      tier: tierFromDifficulty(diff),
      til: legacy?.til ?? legacy?.comment ?? "",
    };

    if (legacy) {
      row.palette = legacy.palette;
      row.stripes = legacy.stripes;
      row.stripesTodo = false;
      row.name_ko = legacy.name_ko;
      row.name_en = legacy.name_en;
      row.population = legacy.population;
      row.population_en = legacy.population_en;
      row.populationDisplay = legacy.population_en;
      row.first_letter_ko = legacy.first_letter_ko;
      row.first_letter_en = legacy.first_letter_en;
      row.letterCount = letterCount(legacy.name_en);
      if (legacy.continent) row.continent = legacy.continent;
    } else {
      const syn = syntheticStripesFromCode(code);
      row.palette = syn.palette;
      row.stripes = syn.stripes;
      row.stripesTodo = true;
    }

    row.populationNumber = popNum;
    row.neighbors = [...nb];
    row.neighbors_en = [...nb];

    out.push(row);
  }

  out.sort((a, b) => a.code.localeCompare(b.code));

  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");

  const tierDaily = out.filter((c) => c.tier === "daily").length;
  const tierArchive = out.filter((c) => c.tier === "archive").length;
  const diffDist = [1, 2, 3, 4, 5].map((d) => ({
    difficulty: d,
    count: out.filter((c) => c.difficulty === d).length,
  }));
  const islands = out
    .filter((c) => Array.isArray(c.neighbors_en) && c.neighbors_en.length === 0)
    .map((c) => `${c.code} ${c.name_en}`);
  const stripeTodo = out.filter((c) => c.stripesTodo === true).map((c) => `${c.code} ${c.name_en}`);

  const flagChecks = [];
  for (const c of out) {
    flagChecks.push(await checkFlagcdn(c.code));
    await new Promise((r) => setTimeout(r, 15));
  }
  const flagFails = flagChecks.filter((f) => !f.ok);

  const report = {
    generatedAt: new Date().toISOString(),
    targetCodesSorted: [...targetCodes].sort(),
    supplementalSeven: EXTRA_CODES,
    totalCountries: out.length,
    tierCounts: { daily: tierDaily, archive: tierArchive },
    difficultyDistribution: diffDist,
    legacyDailyCheck: [...LEGACY_CODES].map((code) => {
      const r = out.find((x) => x.code === code);
      return {
        code,
        tier: r?.tier,
        difficulty: r?.difficulty,
        ok: r?.tier === "daily" && r?.difficulty === 1,
      };
    }),
    islandCountriesCount: islands.length,
    islandCountries: islands,
    stripesTodoCount: stripeTodo.length,
    stripesTodoCountries: stripeTodo,
    flagcdnFailures: flagFails.map((f) => ({
      code: f.code,
      url: f.url,
      status: f.status,
      error: f.error,
    })),
    unListNote:
      "UN members: REST unMember true + Guinea-Bissau (GW) if API omits it; +7: TW HK PS XK VA PR GL",
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
