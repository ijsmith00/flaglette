/**
 * Tests for `countryISO2ToFlagEmoji` in script.js — algorithm must stay identical.
 * Run: node scripts/test-flag-emoji.mjs
 */
import assert from "node:assert";

function countryISO2ToFlagEmoji(iso2) {
  if (typeof iso2 !== "string" || iso2.length !== 2) return "";
  const u = iso2.toUpperCase();
  if (!/^[A-Z]{2}$/.test(u)) return "";
  const base = 0x1f1e6;
  return String.fromCodePoint(
    base + (u.charCodeAt(0) - 65),
    base + (u.charCodeAt(1) - 65)
  );
}

assert.strictEqual(countryISO2ToFlagEmoji("GR"), "🇬🇷");
assert.strictEqual(countryISO2ToFlagEmoji("fr"), "🇫🇷");
assert.strictEqual(countryISO2ToFlagEmoji("JP"), "🇯🇵");
assert.strictEqual(countryISO2ToFlagEmoji("NZ"), "🇳🇿");
assert.strictEqual(countryISO2ToFlagEmoji(""), "");
assert.strictEqual(countryISO2ToFlagEmoji("FRA"), "");
assert.strictEqual(countryISO2ToFlagEmoji("1A"), "");

console.log("flag-emoji: all assertions passed");
