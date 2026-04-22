/**
 * Country record shape in `countries.json` / `#countries-embedded`.
 * Runtime is plain JS; this file is for editor/type hints only.
 */
export interface CountryPaletteBand {
  color: string;
  ratio: number;
}

export interface Country {
  code: string;
  name_ko: string;
  name_en: string;
  population: string;
  population_en: string;
  populationNumber: number;
  populationDisplay: string;
  neighbors: string[];
  neighbors_en: string[];
  first_letter_ko: string;
  first_letter_en: string;
  letterCount: number;
  flagUrl: string;
  continent: string;
  difficulty: number;
  tier: "daily" | "archive";
  palette: CountryPaletteBand[];
  /** One-line shareable trivia in English (no flag facts); empty string if unset. */
  til: string;
  /** Optional override for share line; if absent, flag emoji is derived from `code`. */
  emoji?: string;
  stripes?: unknown;
  stripesTodo?: boolean;
}
