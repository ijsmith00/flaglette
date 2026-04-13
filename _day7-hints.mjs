import fs from "fs";
import { HINT_EN } from "./hint-en.mjs";

const pathJson = new URL("countries.json", import.meta.url);
const pathHtml = new URL("index.html", import.meta.url);

/** Rough population counts (names) — kept for scripts that diff against PEOPLE */
const PEOPLE = {
  JP: 125_000_000,
  US: 330_000_000,
  FR: 68_000_000,
  DE: 84_000_000,
  IT: 59_000_000,
  NL: 18_000_000,
  BE: 12_000_000,
  AT: 9_100_000,
  RU: 144_000_000,
  UA: 38_000_000,
  PL: 38_000_000,
  CO: 52_000_000,
  TH: 71_000_000,
  HU: 9_700_000,
  GA: 2_400_000,
  ID: 278_000_000,
  IE: 5_100_000,
  MC: 39_000,
  YE: 34_000_000,
  NG: 223_000_000,
  ML: 23_000_000,
  EE: 1_300_000,
  LU: 650_000,
  LV: 1_900_000,
  LT: 2_900_000,
  TD: 18_600_000,
  GN: 14_000_000,
  CI: 28_500_000,
  MU: 1_300_000,
  CR: 5_200_000,
};

const HINT = Object.fromEntries(
  Object.entries(HINT_EN).map(([code, en]) => [
    code,
    { neighbors: [...en.neighbors_en] },
  ])
);

function firstLetterFromName(name) {
  const s = String(name || "").trim();
  return [...s][0] || "";
}

function firstLetterEn(nameEn) {
  const ch = firstLetterFromName(nameEn);
  return ch.toUpperCase();
}

const raw = JSON.parse(fs.readFileSync(pathJson, "utf8"));
const ambiguous = [];

const out = raw.map((c) => {
  const h = HINT[c.code];
  if (!h) throw new Error(`missing HINT for ${c.code}`);
  const people = PEOPLE[c.code];
  if (people == null) throw new Error(`missing PEOPLE for ${c.code}`);
  const en = HINT_EN[c.code];
  if (!en) throw new Error(`missing HINT_EN for ${c.code}`);
  const flKo = firstLetterFromName(c.name_ko);
  const flEn = firstLetterEn(c.name_en);
  return {
    code: c.code,
    name_ko: c.name_ko,
    name_en: c.name_en,
    population: en.population_en,
    neighbors: h.neighbors,
    population_en: en.population_en,
    neighbors_en: en.neighbors_en,
    first_letter_ko: flKo,
    first_letter_en: flEn,
    palette: c.palette,
    stripes: c.stripes,
    tier: c.tier,
  };
});

ambiguous.push(
  "MC: population under ~100k shown as ~N thousand",
  "GA/MU/EE: population and borders are approximate",
  "ID/IE/JP/MU: neighbors ['Island nation'] for no land borders",
  "GN vs Guinea-Bissau: similar names; neighbors are representative only"
);

fs.writeFileSync(pathJson, JSON.stringify(out, null, 2) + "\n", "utf8");

let t = fs.readFileSync(pathHtml, "utf8");
const m = '<script type="application/json" id="countries-embedded">';
const s = t.indexOf(m);
const e = t.indexOf("</script>", s);
t =
  t.slice(0, s) +
  m +
  "\n" +
  JSON.stringify(out, null, 2) +
  "\n  </script>" +
  t.slice(e + "</script>".length);
fs.writeFileSync(pathHtml, t, "utf8");

const check = out.every(
  (c) =>
    typeof c.population === "string" &&
    Array.isArray(c.neighbors) &&
    typeof c.population_en === "string" &&
    Array.isArray(c.neighbors_en) &&
    typeof c.first_letter_ko === "string" &&
    c.first_letter_ko.length >= 1 &&
    typeof c.first_letter_en === "string" &&
    c.first_letter_en.length >= 1
);
console.log(JSON.stringify({ count: out.length, allFields: check, ambiguous }, null, 2));
