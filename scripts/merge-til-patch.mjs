import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const patchName = process.argv[2];
if (!patchName) {
  console.error("Usage: node scripts/merge-til-patch.mjs <patch.json>");
  process.exit(1);
}
const patchPath = path.join(root, patchName);
const countriesPath = path.join(root, "countries.json");

const patch = JSON.parse(fs.readFileSync(patchPath, "utf8"));
const countries = JSON.parse(fs.readFileSync(countriesPath, "utf8"));
const changes = [];

for (const c of countries) {
  if (!(c.code in patch)) continue;
  const oldVal = c.til;
  const newVal = patch[c.code];
  if (oldVal !== newVal) changes.push({ code: c.code, old: oldVal, neu: newVal });
  c.til = newVal;
}

fs.writeFileSync(countriesPath, JSON.stringify(countries, null, 2) + "\n");

changes.sort((a, b) => a.code.localeCompare(b.code));
for (const r of changes) {
  console.log(`@@ ${r.code} (til only) @@`);
  console.log(`-    "til": ${JSON.stringify(r.old)}`);
  console.log(`+    "til": ${JSON.stringify(r.neu)}`);
  console.log("");
}

const missing = Object.keys(patch).filter((k) => !countries.some((c) => c.code === k));
if (missing.length) console.error("MISSING_CODES", missing);
