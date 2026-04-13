/**
 * Copies English fields into legacy Korean-key fields so all string values are Latin/English.
 * Run from repo root: node scripts/normalize-countries-english.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const jsonPath = path.join(__dirname, "..", "countries.json");
const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

for (const c of data) {
  if (c.name_en) c.name_ko = c.name_en;
  if (c.population_en != null) c.population = c.population_en;
  if (Array.isArray(c.neighbors_en)) c.neighbors = [...c.neighbors_en];
  if (c.first_letter_en != null) c.first_letter_ko = c.first_letter_en;
}

fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log("Updated countries.json: Korean-key fields aligned with English.");
