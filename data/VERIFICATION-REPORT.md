# Flaglette migration: stripes removal + tier rules (verification)

## Backups

| File | Purpose |
|------|---------|
| `countries.backup.migrate-2026-04-13T23-46-27-036Z.json` | Snapshot immediately before this migration |
| Earlier `countries.backup.*.json` | Prior backups if present |

## Removed fields (200 rows each)

- `stripes`
- `stripesTodo`

## COMPLEX + difficulty 3 → daily allowlist (final)

`PT`, `KH`, `LK`, `AE`, `TW`, `JO`, `EC` — **HK excluded** (archive).

## Tier counts

| Tier | Count |
|------|-------|
| daily | **103** |
| archive | **97** |

## Difficulty distribution (daily pool only)

| difficulty | count |
|------------|------:|
| 1 | 30 |
| 2 | 40 |
| 3 | 33 |
| 4 | 0 |
| 5 | 0 |

## Flag category distribution (daily pool, from diagnosis buckets)

| Category | Count |
|----------|------:|
| COMPLEX | 31 |
| TRUE_STRIPES | 40 |
| SOLID_WITH_EMBLEM | 17 |
| TRIANGLE_OR_DIAGONAL | 7 |
| CROSS | 6 |
| QUARTERED_OR_OTHER | 2 |

## Continent distribution (daily pool)

| Continent | Count |
|-----------|------:|
| Asia | 29 |
| Africa | 33 |
| Europe | 27 |
| South America | 7 |
| North America | 6 |
| Oceania | 1 |

## No land borders in dataset (`neighbors_en: []`)

**Count:** 42 (includes **TW** — REST `borders` empty; neighbor hint uses neutral copy, not a political label.)

Full list: see `migration-stripes-2026-04-13T23-46-27-036Z.log.json` → `countriesWithNoNeighborsListed`.

## Daily selection logic

- Pool = all entries with `tier === "daily"` (103).
- Same **local calendar day** → same seed `YYYYMMDD` integer → `index = seed % pool.length`.
- **No** historical deduplication against past puzzles; repetition is possible when the cycle wraps.
- Pool order follows `countries.json` array order (sorted by `code`).

## UI / copy

- Flag: `flagUrl` image in `#flag-display`; stripes SVG/CSS removed.
- Share line: palette → color emojis (`stripeEmojiLine` key unchanged in `localStorage`).
- How to play: updated (`flaglette_howto_seen_v2` — returning users see the new modal once).
- Neighbor hint (empty list): `No bordering countries in dataset`.

## Machine-readable log

`data/migration-stripes-2026-04-13T23-46-27-036Z.log.json`

## How to test

1. `npm run start` → open `http://localhost:3000` (or open `index.html` via `file://` if embedded JSON is synced).
2. Confirm **flag image** loads (flagcdn), no striped placeholder.
3. **Guesses** row is visually emphasized; layout OK on a narrow viewport (375px).
4. Wrong guesses unlock hints in order; attempt 2 with empty neighbors shows the 🏝️ **dataset** line.
5. Console: `fetch('countries.json').then(r=>r.json()).then(a=>console.log(a.filter(c=>c.tier==='daily').length))` → **103**.
6. Same day reload → same answer (deterministic).
7. Optional: clear `localStorage` key `flaglette_howto_seen_v2` to re-open How to play.
