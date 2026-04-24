/**
 * Group country records by broad continent bucket for Practice Mode.
 * Uses each country's `continent` field only — no hardcoded ISO lists.
 *
 * @param {Array<{ continent: string, code: string, [key: string]: unknown }>} allCountries
 * @returns {{
 *   Africa: typeof allCountries,
 *   Americas: typeof allCountries,
 *   Asia: typeof allCountries,
 *   Europe: typeof allCountries,
 *   Oceania: typeof allCountries
 * }}
 */
export function getCountriesByContinent(allCountries) {
  const out = {
    Africa: [],
    Americas: [],
    Asia: [],
    Europe: [],
    Oceania: [],
  };

  const toBucket = {
    Africa: "Africa",
    Asia: "Asia",
    Europe: "Europe",
    Oceania: "Oceania",
    "North America": "Americas",
    "South America": "Americas",
  };

  for (const c of allCountries) {
    const bucket = toBucket[c.continent];
    if (!bucket) {
      console.warn(
        "[getCountriesByContinent] Unknown continent value; country skipped:",
        c.code,
        c.continent
      );
      continue;
    }
    out[bucket].push(c);
  }

  return out;
}
