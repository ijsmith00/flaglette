/**
 * Step-1 diagnostic: classify real-world flag geometry vs horizontal-3-stripe game model.
 * Does not modify countries.json. Writes data/flag-diagnosis-report.json and .md
 *
 * Usage: node scripts/diagnose-flag-categories.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const countriesPath = path.join(root, "countries.json");
const outJson = path.join(root, "data", "flag-diagnosis-report.json");
const outMd = path.join(root, "data", "flag-diagnosis-report.md");

/** Primary vexillology bucket for the real flag (not the game's stripes field). */
const CATEGORY = {
  TRUE_STRIPES:
    "TRUE_STRIPES — tribands / multibands where stripes are the main design (no large central emblem dominating).",
  SOLID_WITH_EMBLEM:
    "SOLID_WITH_EMBLEM — mostly solid field or simple bands plus large emblem, text, weapon, or disc.",
  CROSS:
    "CROSS — Nordic cross, Greek cross, Union Jack–style, Swiss cross, or cross as defining geometry.",
  TRIANGLE_OR_DIAGONAL:
    "TRIANGLE_OR_DIAGONAL — hoist triangle, wedge, diagonal bicolor/tricolor, or strong diagonal division.",
  COMPLEX:
    "COMPLEX — coats of arms, maps, detailed seals, many symbols, or strong non-stripe geometry.",
  QUARTERED_OR_OTHER:
    "QUARTERED_OR_OTHER — quarters, saltires without Nordic arms, Panamanian quarters, odd partitions.",
};

/**
 * Per ISO 3166-1 alpha-2. Manual expert-style classification for diagnosis.
 * (Game’s synthetic horizontal 3-band model fits mainly TRUE_STRIPES; others are misleading when forced to stripes.)
 */
const FLAG_TYPE = {
  AD: "COMPLEX",
  AE: "COMPLEX",
  AF: "COMPLEX",
  AG: "COMPLEX",
  AL: "SOLID_WITH_EMBLEM",
  AM: "TRUE_STRIPES",
  AO: "COMPLEX",
  AR: "COMPLEX",
  AT: "TRUE_STRIPES",
  AU: "COMPLEX",
  AZ: "TRUE_STRIPES",
  BA: "TRIANGLE_OR_DIAGONAL",
  BB: "COMPLEX",
  BD: "SOLID_WITH_EMBLEM",
  BE: "TRUE_STRIPES",
  BF: "TRUE_STRIPES",
  BG: "TRUE_STRIPES",
  BH: "COMPLEX",
  BI: "QUARTERED_OR_OTHER",
  BJ: "TRIANGLE_OR_DIAGONAL",
  BN: "COMPLEX",
  BO: "COMPLEX",
  BR: "COMPLEX",
  BS: "TRIANGLE_OR_DIAGONAL",
  BT: "COMPLEX",
  BW: "TRUE_STRIPES",
  BY: "COMPLEX",
  BZ: "COMPLEX",
  CA: "SOLID_WITH_EMBLEM",
  CD: "TRIANGLE_OR_DIAGONAL",
  CF: "COMPLEX",
  CG: "TRIANGLE_OR_DIAGONAL",
  CH: "CROSS",
  CI: "TRUE_STRIPES",
  CL: "SOLID_WITH_EMBLEM",
  CM: "TRUE_STRIPES",
  CN: "SOLID_WITH_EMBLEM",
  CO: "TRUE_STRIPES",
  CR: "COMPLEX",
  CU: "TRIANGLE_OR_DIAGONAL",
  CV: "COMPLEX",
  CY: "SOLID_WITH_EMBLEM",
  CZ: "TRIANGLE_OR_DIAGONAL",
  DE: "TRUE_STRIPES",
  DJ: "TRIANGLE_OR_DIAGONAL",
  DK: "CROSS",
  DM: "COMPLEX",
  DO: "CROSS",
  DZ: "SOLID_WITH_EMBLEM",
  EC: "COMPLEX",
  EE: "TRUE_STRIPES",
  EG: "COMPLEX",
  ER: "COMPLEX",
  ES: "COMPLEX",
  ET: "COMPLEX",
  FI: "CROSS",
  FJ: "COMPLEX",
  FM: "SOLID_WITH_EMBLEM",
  FR: "TRUE_STRIPES",
  GA: "TRUE_STRIPES",
  GB: "CROSS",
  GD: "COMPLEX",
  GE: "CROSS",
  GH: "TRUE_STRIPES",
  GL: "SOLID_WITH_EMBLEM",
  GM: "TRUE_STRIPES",
  GN: "TRUE_STRIPES",
  GQ: "COMPLEX",
  GR: "CROSS",
  GT: "COMPLEX",
  GW: "COMPLEX",
  GY: "TRIANGLE_OR_DIAGONAL",
  HK: "COMPLEX",
  HN: "COMPLEX",
  HR: "COMPLEX",
  HT: "COMPLEX",
  HU: "TRUE_STRIPES",
  ID: "TRUE_STRIPES",
  IE: "TRUE_STRIPES",
  IL: "CROSS",
  IN: "COMPLEX",
  IQ: "COMPLEX",
  IR: "COMPLEX",
  IS: "CROSS",
  IT: "TRUE_STRIPES",
  JM: "QUARTERED_OR_OTHER",
  JO: "COMPLEX",
  JP: "SOLID_WITH_EMBLEM",
  KE: "COMPLEX",
  KG: "SOLID_WITH_EMBLEM",
  KH: "COMPLEX",
  KI: "COMPLEX",
  KM: "COMPLEX",
  KN: "COMPLEX",
  KP: "COMPLEX",
  KR: "COMPLEX",
  KW: "TRUE_STRIPES",
  KZ: "SOLID_WITH_EMBLEM",
  LA: "SOLID_WITH_EMBLEM",
  LB: "COMPLEX",
  LC: "COMPLEX",
  LI: "COMPLEX",
  LK: "COMPLEX",
  LR: "COMPLEX",
  LS: "COMPLEX",
  LT: "TRUE_STRIPES",
  LU: "TRUE_STRIPES",
  LV: "TRUE_STRIPES",
  LY: "TRUE_STRIPES",
  MA: "SOLID_WITH_EMBLEM",
  MC: "TRUE_STRIPES",
  MD: "COMPLEX",
  ME: "COMPLEX",
  MG: "TRIANGLE_OR_DIAGONAL",
  MH: "COMPLEX",
  MK: "COMPLEX",
  ML: "TRUE_STRIPES",
  MM: "COMPLEX",
  MN: "COMPLEX",
  MR: "SOLID_WITH_EMBLEM",
  MT: "COMPLEX",
  MU: "TRUE_STRIPES",
  MV: "SOLID_WITH_EMBLEM",
  MW: "COMPLEX",
  MX: "COMPLEX",
  MY: "COMPLEX",
  MZ: "COMPLEX",
  NA: "COMPLEX",
  NE: "TRUE_STRIPES",
  NG: "TRUE_STRIPES",
  NI: "COMPLEX",
  NL: "TRUE_STRIPES",
  NO: "CROSS",
  NP: "COMPLEX",
  NR: "COMPLEX",
  NZ: "CROSS",
  OM: "COMPLEX",
  PA: "QUARTERED_OR_OTHER",
  PE: "TRUE_STRIPES",
  PG: "COMPLEX",
  PH: "TRIANGLE_OR_DIAGONAL",
  PK: "SOLID_WITH_EMBLEM",
  PL: "TRUE_STRIPES",
  PR: "TRIANGLE_OR_DIAGONAL",
  PS: "TRUE_STRIPES",
  PT: "COMPLEX",
  PW: "SOLID_WITH_EMBLEM",
  PY: "COMPLEX",
  QA: "COMPLEX",
  RO: "TRUE_STRIPES",
  RS: "COMPLEX",
  RU: "TRUE_STRIPES",
  RW: "COMPLEX",
  SA: "SOLID_WITH_EMBLEM",
  SB: "COMPLEX",
  SC: "COMPLEX",
  SD: "TRUE_STRIPES",
  SE: "CROSS",
  SG: "COMPLEX",
  SI: "COMPLEX",
  SK: "COMPLEX",
  SL: "TRUE_STRIPES",
  SM: "COMPLEX",
  SN: "TRUE_STRIPES",
  SO: "SOLID_WITH_EMBLEM",
  SR: "COMPLEX",
  SS: "TRIANGLE_OR_DIAGONAL",
  ST: "COMPLEX",
  SV: "COMPLEX",
  SY: "TRUE_STRIPES",
  SZ: "COMPLEX",
  TD: "TRUE_STRIPES",
  TG: "COMPLEX",
  TH: "TRUE_STRIPES",
  TJ: "COMPLEX",
  TL: "COMPLEX",
  TM: "COMPLEX",
  TN: "SOLID_WITH_EMBLEM",
  TO: "CROSS",
  TR: "SOLID_WITH_EMBLEM",
  TT: "COMPLEX",
  TV: "CROSS",
  TW: "COMPLEX",
  TZ: "QUARTERED_OR_OTHER",
  UA: "TRUE_STRIPES",
  UG: "COMPLEX",
  US: "COMPLEX",
  UY: "COMPLEX",
  UZ: "COMPLEX",
  VA: "COMPLEX",
  VC: "COMPLEX",
  VE: "COMPLEX",
  VN: "SOLID_WITH_EMBLEM",
  VU: "COMPLEX",
  WS: "COMPLEX",
  XK: "COMPLEX",
  YE: "TRUE_STRIPES",
  ZA: "COMPLEX",
  ZM: "SOLID_WITH_EMBLEM",
  ZW: "COMPLEX",
};

function main() {
  const countries = JSON.parse(fs.readFileSync(countriesPath, "utf8"));
  if (countries.length !== 200) {
    console.warn("Expected 200 countries, got", countries.length);
  }

  const missing = countries.filter((c) => !FLAG_TYPE[c.code]);
  if (missing.length) {
    throw new Error(`Missing FLAG_TYPE for: ${missing.map((m) => m.code).join(", ")}`);
  }

  const byBucket = Object.create(null);
  for (const k of Object.keys(CATEGORY)) {
    byBucket[k] = [];
  }

  const rows = countries.map((c) => {
    const bucket = FLAG_TYPE[c.code];
    const stripesTodo = c.stripesTodo === true;
    const direction = c.stripes?.direction;
    const bandCount = c.stripes?.bands?.length ?? 0;
    /** Heuristic: anything not TRUE_STRIPES is a poor fit for “3 horizontal stripes only” mental model. */
    const poorFitForHorizontalThreeBandModel = bucket !== "TRUE_STRIPES";
    /** Generator always used horizontal 3 bands for stripesTodo entries. */
    const syntheticThreeBandLikelyWrong = stripesTodo === true;

    byBucket[bucket].push({
      code: c.code,
      name_en: c.name_en,
      stripesTodo,
      direction,
      bandCount,
    });

    return {
      code: c.code,
      name_en: c.name_en,
      category: bucket,
      stripesTodo,
      direction,
      bandCount,
      poorFitForHorizontalThreeBandModel,
      syntheticThreeBandLikelyWrong,
    };
  });

  const wrongSynthetic = rows.filter((r) => r.syntheticThreeBandLikelyWrong);
  const wrongByCategory = rows.filter(
    (r) => r.poorFitForHorizontalThreeBandModel && r.syntheticThreeBandLikelyWrong
  );
  const trueStripesButStillSynthetic = rows.filter(
    (r) => r.category === "TRUE_STRIPES" && r.syntheticThreeBandLikelyWrong
  );

  const counts = Object.fromEntries(
    Object.keys(byBucket).map((k) => [k, byBucket[k].length])
  );

  const report = {
    sourceFile: path.relative(root, countriesPath).replace(/\\/g, "/"),
    totalCountries: countries.length,
    categoryDefinitions: CATEGORY,
    categoryCounts: counts,
    buckets: byBucket,
    summary: {
      rowsWithStripesTodoTrue: countries.filter((c) => c.stripesTodo === true).length,
      rowsWithStripesTodoFalse: countries.filter((c) => c.stripesTodo === false).length,
      /** All auto-filled 3-band horizontal stripes from generator — almost always wrong vs real flag. */
      expectedWrongSyntheticStripes: wrongSynthetic.map((r) => `${r.code} ${r.name_en}`),
      /** Subset: wrong synthetic where real flag is also not a simple stripe design (double problem). */
      expectedWrongSynthetic_nonTrueStripes: wrongByCategory.map(
        (r) => `${r.code} ${r.name_en} (${r.category})`
      ),
      /** TRUE_STRIPES real flags that still use fake colors/bands from generator (170 − non-stripe miscount). */
      trueStripesFlagsButSyntheticBands: trueStripesButStillSynthetic.map(
        (r) => `${r.code} ${r.name_en}`
      ),
    },
    notes: [
      "poorFitForHorizontalThreeBandModel: real-world flag is not primarily 3 horizontal color bands (game’s old default).",
      "syntheticThreeBandLikelyWrong: stripesTodo===true from generate-countries-database.mjs (HSL hash horizontal 3 bands).",
      "Legacy 30 (stripesTodo false) used hand-authored stripes in Flaglette; some are SOLID/CROSS in reality but were given bespoke SVG/CSS-style bands (e.g. JP center, US special) — review separately under section C.",
    ],
  };

  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, JSON.stringify(report, null, 2) + "\n", "utf8");

  let md = `# Flag diagnosis (Step 1)\n\n`;
  md += `- **Data file:** \`${report.sourceFile}\`\n`;
  md += `- **Total entries:** ${report.totalCountries}\n\n`;
  md += `## Category counts\n\n`;
  md += `| Category | Count |\n|----------|-------|\n`;
  for (const [k, v] of Object.entries(counts)) {
    md += `| ${k} | ${v} |\n`;
  }
  md += `\n## Category definitions\n\n`;
  for (const [k, desc] of Object.entries(CATEGORY)) {
    md += `### ${k}\n${desc}\n\n`;
  }
  md += `## Lists by category\n\n`;
  for (const k of Object.keys(byBucket)) {
    md += `### ${k} (${byBucket[k].length})\n\n`;
    for (const x of byBucket[k].sort((a, b) => a.code.localeCompare(b.code))) {
      const flag = x.stripesTodo ? " [stripesTodo]" : "";
      md += `- **${x.code}** — ${x.name_en}${flag} (\`${x.direction}\`, ${x.bandCount} bands)\n`;
    }
    md += `\n`;
  }
  md += `## Expected wrongly filled \`stripes\` (synthetic 3-band horizontal)\n\n`;
  md += `**Count:** ${wrongSynthetic.length} (all rows with \`stripesTodo: true\` from the bulk generator).\n\n`;
  md += `These are **not** faithful triband approximations; colors were procedurally hashed.\n\n`;
  md += `### Worst mismatch: synthetic bands + real flag not TRUE_STRIPES\n\n`;
  md += `**Count:** ${wrongByCategory.length}\n\n`;
  for (const line of report.summary.expectedWrongSynthetic_nonTrueStripes) {
    md += `- ${line}\n`;
  }
  md += `\n### TRUE_STRIPES real flags but still synthetic / wrong colors\n\n`;
  md += `**Count:** ${report.summary.trueStripesFlagsButSyntheticBands.length}\n\n`;
  for (const line of report.summary.trueStripesFlagsButSyntheticBands) {
    md += `- ${line}\n`;
  }
  md += `\n## Legacy 30 (\`stripesTodo: false\`)\n\n`;
  for (const x of rows
    .filter((r) => !r.syntheticThreeBandLikelyWrong)
    .sort((a, b) => a.code.localeCompare(b.code))) {
    md += `- **${x.code}** — ${x.name_en} — classified **${x.category}** (hand-authored stripes in DB; verify vs category)\n`;
  }
  md += `\n---\n*Generated by scripts/diagnose-flag-categories.mjs — no data files modified.*\n`;

  fs.writeFileSync(outMd, md, "utf8");
  console.log("Wrote:", outJson);
  console.log("Wrote:", outMd);
  console.log(JSON.stringify(counts, null, 2));
}

main();
