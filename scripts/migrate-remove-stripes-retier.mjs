/**
 * Remove stripes + stripesTodo; reassign tier (approved COMPLEX diff3 allowlist).
 * Writes data/migration-stripes-[timestamp].log.json
 *
 * Usage: node scripts/migrate-remove-stripes-retier.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const countriesPath = path.join(root, "countries.json");
const reportPath = path.join(root, "data", "flag-diagnosis-report.json");

/** COMPLEX + difficulty 3 → daily (HK excluded → archive). */
const COMPLEX_DIFF3_DAILY_ALLOW = new Set([
  "PT",
  "KH",
  "LK",
  "AE",
  "TW",
  "JO",
  "EC",
]);

function loadTypes() {
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const types = Object.create(null);
  for (const cat of Object.keys(report.buckets)) {
    for (const x of report.buckets[cat]) {
      types[x.code] = cat;
    }
  }
  return types;
}

function computeTier(c, types) {
  const ft = types[c.code];
  const d = c.difficulty;
  if (d >= 4) return "archive";
  if (ft !== "COMPLEX") return "daily";
  if (d <= 2) return "daily";
  if (d === 3 && COMPLEX_DIFF3_DAILY_ALLOW.has(c.code)) return "daily";
  return "archive";
}

function main() {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(root, `countries.backup.migrate-${ts}.json`);
  const logPath = path.join(root, "data", `migration-stripes-${ts}.log.json`);

  const raw = fs.readFileSync(countriesPath, "utf8");
  fs.writeFileSync(backupPath, raw, "utf8");

  const types = loadTypes();
  const countries = JSON.parse(raw);

  const tierChanges = [];
  const removedFields = { stripes: 0, stripesTodo: 0 };

  const next = countries.map((c) => {
    const beforeTier = c.tier;
    if ("stripes" in c) {
      removedFields.stripes++;
      delete c.stripes;
    }
    if ("stripesTodo" in c) {
      removedFields.stripesTodo++;
      delete c.stripesTodo;
    }
    const afterTier = computeTier(c, types);
    if (beforeTier !== afterTier) {
      tierChanges.push({
        code: c.code,
        name_en: c.name_en,
        before: beforeTier,
        after: afterTier,
      });
    }
    c.tier = afterTier;
    return c;
  });

  fs.writeFileSync(countriesPath, JSON.stringify(next, null, 2) + "\n", "utf8");

  const daily = next.filter((c) => c.tier === "daily").length;
  const archive = next.filter((c) => c.tier === "archive").length;

  const byDiffDaily = {};
  for (let d = 1; d <= 5; d++) byDiffDaily[d] = 0;
  for (const c of next.filter((x) => x.tier === "daily")) {
    byDiffDaily[c.difficulty] = (byDiffDaily[c.difficulty] || 0) + 1;
  }

  const byCatDaily = Object.create(null);
  for (const c of next.filter((x) => x.tier === "daily")) {
    const k = types[c.code];
    byCatDaily[k] = (byCatDaily[k] || 0) + 1;
  }

  const continentDaily = Object.create(null);
  for (const c of next.filter((x) => x.tier === "daily")) {
    const k = c.continent || "—";
    continentDaily[k] = (continentDaily[k] || 0) + 1;
  }

  const noLandBorders = next.filter(
    (c) => Array.isArray(c.neighbors_en) && c.neighbors_en.length === 0
  );
  const islandList = noLandBorders.map((c) => `${c.code} ${c.name_en}`).sort();

  const log = {
    timestamp: new Date().toISOString(),
    backupWritten: path.relative(root, backupPath).replace(/\\/g, "/"),
    countriesJson: path.relative(root, countriesPath).replace(/\\/g, "/"),
    removedFields,
    tierChangeCount: tierChanges.length,
    tierChanges,
    finalDailyCount: daily,
    finalArchiveCount: archive,
    difficultyInDailyPool: byDiffDaily,
    flagCategoryInDailyPool: byCatDaily,
    continentInDailyPool: continentDaily,
    countriesWithNoNeighborsListedCount: noLandBorders.length,
    countriesWithNoNeighborsListed: islandList,
    dailySelectionLogic:
      "Same calendar day → same local date integer → index = (YYYYMMDD seed) mod (daily pool length). No historical deduplication; pool order is stable (sorted by code in JSON).",
    taiwanNeighborNote:
      "TW uses REST Countries borders (typically empty). Hint shows generic no-land-borders message; not a political label.",
    complexDiff3Allowlist: [...COMPLEX_DIFF3_DAILY_ALLOW].sort(),
  };

  fs.writeFileSync(logPath, JSON.stringify(log, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(log, null, 2));
}

main();
