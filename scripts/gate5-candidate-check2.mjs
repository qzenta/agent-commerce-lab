// Gate 5 candidate discovery — pass 2: deep crawl (up to 30 pages), practice
// identity check, fact-area grep over ALL fetched text. Public info only.
const candidates = [
  { base: "https://taxplanners.co.za", extra: ["https://taxplanners.co.za/vat-registration-south-africa/"] },
  { base: "https://smarteraccounting.co.za" },
  { base: "https://blvckrocket.com" },
  { base: "https://www.patc.co.za" },
  { base: "https://mkdsa.co.za" },
];

const factChecks = {
  VAT_2300000: /R\s*2[,.]?3\s*(m(illion)?|300[,. ]*000)|2[,.]?3\s*million|2[,. ]*300[,. ]*000/i,
  UIF_17712: /17[,. ]*712|R\s*17[,. ]*712/i,
  ROE: /Return of Earnings|COIDA/i,
  EMP501: /EMP501/i,
};

const PRACTICE_RE = /accountant|accounting|chartered|tax consultant|professional accountant|CA\s*\(SA\)|SAIPA|bookkeeper/i;
const PRINCIPAL_RE = /(director|owner|principal|founding|partner|CA\s*\(SA\)|SAIPA)/i;

async function fetchText(url) {
  try {
    const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (research; no contact)" } });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function collectUrls(base) {
  const out = [];
  for (const path of ["/sitemap.xml", "/sitemap_index.xml", "/wp-sitemap.xml"]) {
    const xml = await fetchText(base + path);
    if (xml) {
      const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => m[1].trim());
      if (locs.length > 0) return { urls: locs, sitemap: path };
    }
  }
  // Fallback: homepage internal links.
  const home = await fetchText(base + "/");
  if (home) {
    const hrefs = [...home.matchAll(/href=["'](https?:\/\/[^"']+)["']/gi)].map((m) => m[1]);
    const same = [...new Set(hrefs.filter((u) => new URL(u).hostname === new URL(base).hostname))];
    return { urls: [base + "/", ...same], sitemap: "homepage-links" };
  }
  return { urls: [base + "/"], sitemap: "none" };
}

const results = [];
for (const c of candidates) {
  const { urls, sitemap } = await collectUrls(c.base);
  const all = [...new Set([...urls, ...(c.extra ?? [])])].slice(0, 30);
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
  const homeText = (home ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const entry = {
    base: c.base,
    sitemap,
    pageCount: all.length,
    fetched,
    factAreas: facts,
    practiceSignals: { isPractice: PRACTICE_RE.test(combined), principalSignal: PRINCIPAL_RE.test(homeText) },
    homeSnippet: homeText.slice(0, 160),
  };
  results.push(entry);
  console.log(JSON.stringify(entry));
}

console.log("\n=== SHORTLIST (>=2 fact areas, in/near page range, practice signal) ===");
for (const r of results) {
  const factsOk = r.factAreas.length >= 2;
  const size = r.pageCount >= 8 && r.pageCount <= 80;
  console.log(r.base, "| pages:", r.pageCount, "| facts:", r.factAreas.join(",") || "-", "| practice:", r.practiceSignals.isPractice, "| principal:", r.practiceSignals.principalSignal, "| sizeOk:", size, "| factsOk:", factsOk);
}
