import fs from "fs";
import { HINT_EN } from "./hint-en.mjs";

const pathJson = new URL("countries.json", import.meta.url);
const pathHtml = new URL("index.html", import.meta.url);

/** 대략 인구(명) — 한국어 표기용 */
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

/** 인구 n명 → "약 …" 한국어 문자열 (만 단위 반올림) */
function formatPopulationKr(n) {
  const man = Math.round(n / 10000);
  if (man >= 10000) {
    const eok = Math.floor(man / 10000);
    const rest = man % 10000;
    if (rest === 0) return `약 ${eok}억`;
    return `약 ${eok}억 ${rest.toLocaleString("en-US")}만`;
  }
  if (man >= 1000) {
    return `약 ${man.toLocaleString("en-US")}만`;
  }
  return `약 ${man}만`;
}

/** 국경 이웃(한국어 2~4개 또는 ["섬나라"]) */
const HINT = {
  JP: { neighbors: ["섬나라"] },
  US: { neighbors: ["캐나다", "멕시코"] },
  FR: { neighbors: ["독일", "이탈리아", "벨기에", "스페인"] },
  DE: { neighbors: ["프랑스", "폴란드", "네덜란드", "오스트리아"] },
  IT: { neighbors: ["프랑스", "오스트리아", "스위스", "슬로베니아"] },
  NL: { neighbors: ["벨기에", "독일"] },
  BE: { neighbors: ["프랑스", "네덜란드", "독일", "룩셈부르크"] },
  AT: { neighbors: ["독일", "이탈리아", "슬로바키아", "헝가리"] },
  RU: { neighbors: ["우크라이나", "핀란드", "노르웨이", "에스토니아"] },
  UA: { neighbors: ["폴란드", "슬로바키아", "헝가리", "루마니아"] },
  PL: { neighbors: ["독일", "체코", "슬로바키아", "우크라이나"] },
  CO: { neighbors: ["베네수엘라", "에콰도르", "브라질", "페루"] },
  TH: { neighbors: ["미얀마", "라오스", "말레이시아", "캄보디아"] },
  HU: { neighbors: ["오스트리아", "슬로바키아", "루마니아", "세르비아"] },
  GA: { neighbors: ["카메룬", "적도기니", "콩고"] },
  ID: { neighbors: ["섬나라"] },
  IE: { neighbors: ["섬나라"] },
  MC: { neighbors: ["프랑스"] },
  YE: { neighbors: ["오만", "사우디아라비아"] },
  NG: { neighbors: ["베넹", "니제르", "카메룬"] },
  ML: { neighbors: ["니제르", "세네갈", "기니", "부르키나파소"] },
  EE: { neighbors: ["라트비아", "러시아"] },
  LU: { neighbors: ["벨기에", "프랑스", "독일"] },
  LV: { neighbors: ["에스토니아", "리투아니아", "러시아"] },
  LT: { neighbors: ["라트비아", "폴란드", "벨라루스"] },
  TD: { neighbors: ["니제르", "리비아", "수단", "카메룬"] },
  GN: { neighbors: ["기니비사우", "시에라리온", "말리", "코트디부아르"] },
  CI: { neighbors: ["기니", "말리", "가나", "부르키나파소"] },
  MU: { neighbors: ["섬나라"] },
  CR: { neighbors: ["니카라과", "파나마"] },
};

function firstLetterKo(nameKo) {
  const s = nameKo.trim();
  return [...s][0];
}

function firstLetterEn(nameEn) {
  const s = nameEn.trim();
  const ch = [...s][0];
  return ch.toUpperCase();
}

const raw = JSON.parse(fs.readFileSync(pathJson, "utf8"));
const ambiguous = [];

const out = raw.map((c) => {
  const h = HINT[c.code];
  if (!h) throw new Error(`missing HINT for ${c.code}`);
  const people = PEOPLE[c.code];
  if (people == null) throw new Error(`missing PEOPLE for ${c.code}`);
  const flKo = firstLetterKo(c.name_ko);
  const flEn = firstLetterEn(c.name_en);
  const en = HINT_EN[c.code];
  if (!en) throw new Error(`missing HINT_EN for ${c.code}`);
  return {
    code: c.code,
    name_ko: c.name_ko,
    name_en: c.name_en,
    population: formatPopulationKr(people),
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
  "MC 등: 인구 10만 미만은 '약 N만' 형태",
  "GA/MU/EE 등: 인구·국경은 대략값",
  "ID/IE/JP/MU: 이웃 ['섬나라'] 단일 표기",
  "GN↔기니비사우 등 국명 유사, 이웃 나열은 대표적인 것만"
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
