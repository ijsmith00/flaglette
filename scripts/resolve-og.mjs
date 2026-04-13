/**
 * Resolves absolute URLs for og:image, twitter:image, og:url, canonical from
 * site-origin.txt or SITE_ORIGIN (public HTTPS origin).
 * Needed for Kakao, Facebook, and other link previews.
 *
 * npm run prepare:og
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const indexPath = path.join(root, "index.html");
const originPath = path.join(root, "site-origin.txt");

function readOrigin() {
  const siteOrigin = process.env.SITE_ORIGIN?.trim();
  if (siteOrigin) return siteOrigin.replace(/\/$/, "");

  const netlifyUrl = process.env.URL?.trim();
  if (netlifyUrl?.startsWith("http")) return netlifyUrl.replace(/\/$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;

  try {
    const raw = fs.readFileSync(originPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      return t.replace(/\/$/, "");
    }
  } catch {
    /* optional */
  }
  return "";
}

function escAttr(s) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

const origin = readOrigin();
let lines = fs.readFileSync(indexPath, "utf8").split(/\r?\n/);

const imageRel = "image/og-card.png";
const imageUrl = origin ? `${origin}/${imageRel}` : imageRel;
const pageUrl = origin ? `${origin}/` : "";

if (!origin) {
  lines = lines.filter((line) => {
    if (line.includes('property="og:url"')) return false;
    if (line.includes('property="og:image:secure_url"')) return false;
    if (line.includes('rel="canonical"')) return false;
    return true;
  });
}

let html = lines.join("\n");

html = html.replace(
  /<meta property="og:image" content="[^"]*">/,
  `<meta property="og:image" content="${escAttr(imageUrl)}">`
);
html = html.replace(
  /<meta name="twitter:image" content="[^"]*">/,
  `<meta name="twitter:image" content="${escAttr(imageUrl)}">`
);

if (origin) {
  if (!html.includes('property="og:url"')) {
    html = html.replace(
      /<meta property="og:type" content="website">/,
      `<meta property="og:type" content="website">\n  <meta property="og:url" content="${escAttr(pageUrl)}">`
    );
  } else {
    html = html.replace(
      /<meta property="og:url" content="[^"]*">/,
      `<meta property="og:url" content="${escAttr(pageUrl)}">`
    );
  }

  if (imageUrl.startsWith("https://") && !html.includes("og:image:secure_url")) {
    html = html.replace(
      /<meta property="og:image:height" content="630">/,
      `<meta property="og:image:height" content="630">\n  <meta property="og:image:secure_url" content="${escAttr(imageUrl)}">`
    );
  }

  const canon = `  <link rel="canonical" href="${escAttr(pageUrl)}">`;
  if (html.includes('rel="canonical"')) {
    html = html.replace(/\n\s*<link rel="canonical" href="[^"]*">\s*/, `\n${canon}\n`);
  } else {
    html = html.replace(
      /<title>Flaglette<\/title>/,
      `<title>Flaglette</title>\n${canon}`
    );
  }
}

fs.writeFileSync(indexPath, html, "utf8");

if (origin) {
  console.log("prepare:og OK");
  console.log("  origin:", origin);
  console.log("  og:image →", imageUrl);
} else {
  console.log("prepare:og: no HTTPS URL in site-origin.txt — keeping relative og:image");
  console.log("  For Kakao preview: put your deploy URL in site-origin.txt and run npm run prepare:og");
}
