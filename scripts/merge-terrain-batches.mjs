/**
 * Merge terrain-hints-batches/batch-*.json into terrain-hints-proposal.json (ISO keys).
 * Usage: node scripts/merge-terrain-batches.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const batchDir = path.join(root, "terrain-hints-batches");
const outPath = path.join(root, "terrain-hints-proposal.json");

const merged = {};
const files = fs
  .readdirSync(batchDir)
  .filter((f) => /^batch-\d+\.json$/i.test(f))
  .sort((a, b) => {
    const na = parseInt(a.match(/\d+/)?.[0] ?? "0", 10);
    const nb = parseInt(b.match(/\d+/)?.[0] ?? "0", 10);
    return na - nb;
  });

for (const f of files) {
  const p = path.join(batchDir, f);
  const chunk = JSON.parse(fs.readFileSync(p, "utf8"));
  for (const [k, v] of Object.entries(chunk)) {
    if (merged[k] !== undefined) {
      console.warn("Duplicate key", k, "in", f, "—later file wins");
    }
    merged[k] = v;
  }
}

fs.writeFileSync(outPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
console.log("Merged", files.length, "batch files →", outPath);
console.log("Keys:", Object.keys(merged).length);
