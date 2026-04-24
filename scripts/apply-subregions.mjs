/**
 * One-off: insert `subregion` after `continent` for each country in countries.json.
 * Run: node scripts/apply-subregions.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const countriesPath = path.join(root, "countries.json");

const MAP = JSON.parse(
  fs.readFileSync(new URL("./subregion-map.json", import.meta.url), "utf8")
);

const data = JSON.parse(fs.readFileSync(countriesPath, "utf8"));
let changed = 0;
const out = data.map((c) => {
  const sub = MAP[c.code];
  if (sub === undefined) {
    throw new Error(`No subregion mapping for ISO code: ${c.code}`);
  }
  if (c.subregion !== undefined) {
    throw new Error(`Country ${c.code} already has subregion`);
  }
  changed += 1;
  const next = {};
  for (const k of Object.keys(c)) {
    next[k] = c[k];
    if (k === "continent") {
      next.subregion = sub;
    }
  }
  return next;
});

fs.writeFileSync(countriesPath, JSON.stringify(out, null, 2) + "\n", "utf8");
console.log("Updated", changed, "countries →", countriesPath);
