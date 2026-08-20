// Gate 5 candidate discovery — pass 3: sitemap-index recursion, browser-like UA,
// expanded pool, fact-area grep over fetched pages. Public info only.
const candidates = [
  { base: "https://taxplanners.co.za" },
  { base: "https://smarteraccounting.co.za" },
  { base: "https://simpsonaccounting.co.za" },
  { base: "https://visionaryaccounting.co.za" },
  { base: "https://mkdsa.co.za" },
  { base: "https://www.patc.co.za" },
  { base: "https://blvckrocket.com" },
];

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const factChecks = {
  VAT_2300000: /R\s*2[,.]?3\s*(m(illion)?|300[,. ]*000)|2[,.]?3\s*million|2[,. ]*300[,. ]*000/i,
  UIF_17712: /17[,. ]*712|R\s*17[,. ]*712/i,
  ROE: /Return of Earnings|COIDA/i,
  EMP501: /EMP501/i,
};
const PRACTICE_RE = /accountant|accounting|chartered|tax consultant|professional accountant|CA\s*\(SA\)|SAIPA/i;

async function fetchText(url) {
  try {
    const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": UA, "Accept": "text/html" } });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// Recursively collect sitemap URLs (handles sitemap indexes).
async function collectSitemap(base, depth = 0) {
  if (depth > 2) return [];
  const xml = await fetchText(base);
  if (!xml) return [];
  const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => m[1].trim());
  const out = [];
  for (const loc of locs) {
    if (/sitemap.*\.xml|\.xml$/i.test(loc) && !loc.includes("/posts/")) {
      const nested = await collectSitemap(loc, depth + 1);
      if (nested.length > 0) out.push(...nested);
      else out.push(loc);
    } else {
      out.push(loc);
    }
  }
  return out;
}

const results = [];
for (const c of candidates) {
  let urls = await collectSitemap(c.base + "/sitemap.xml");
  let sitemap = "sitemap.xml";
  if (urls.length === 0) {
    const home = await fetchText(c.base + "/");
    if (home) {
      const hrefs = [...home.matchAll(/href=["'](https?:\/\/[^"']+)["']/gi)].map((m) => m[1]);
      urls = [...new Set([c.base + "/", ...hrefs.filter((u) => new URL(u).hostname === new URL(c.base).hostname)])];
      sitemap = "homepage-links";
    }
  }
  const all = [...new Set(urls)].slice(0, 40);
  let combined = "";
  let fetched = 0;
  for (const u of all) {
    const html = await fetchText(u);
    if (html) {
      fetched++;
      combined += " " + html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    }
  }
  const facts = Object.entries(factChecks).filter(([, re]) => re.test(combined)).map(([k]) => k);
  const home = await fetchText(c.base + "/");
  const homeText = (home ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 200);
  const entry = { base: c.base, sitemap, pageCount: all.length, fetched, factAreas: facts, isPractice: PRACTICE_RE.test(combined), homeSnippet: homeText };
  results.push(entry);
  console.log(JSON.stringify(entry));
}

console.log("\n=== RANKING INPUT (facts >= 2 AND practice) ===");
for (const r of results) {
  if (r.factAreas.length >= 2 && r.isPractice) console.log(r.base, "| pages:", r.pageCount, "| facts:", r.factAreas.join(","));
}
