/**
 * Embeds countries.json into index.html #countries-embedded (for file://).
 * Usage: node scripts/sync-countries-embedded.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const jsonPath = path.join(root, "countries.json");
const indexPath = path.join(root, "index.html");

const countries = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const pretty = JSON.stringify(countries, null, 2);
const index = fs.readFileSync(indexPath, "utf8");
const start = index.indexOf('<script type="application/json" id="countries-embedded">');
const end = index.indexOf("</script>", start);
if (start === -1 || end === -1) throw new Error("countries-embedded block not found");
const before = index.slice(0, start + '<script type="application/json" id="countries-embedded">'.length);
const after = index.slice(end);
const next = `${before}\n${pretty}\n  ${after}`;
fs.writeFileSync(indexPath, next, "utf8");
console.log("Updated index.html #countries-embedded from countries.json");
