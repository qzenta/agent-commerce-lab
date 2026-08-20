// Gate 5 candidate discovery — public-information verification only (no contact).
// For each candidate: fetch /sitemap.xml (page count) and key pages, grep for the
// five approved fact areas (public evidence, verified by direct fetch — not from
// search summaries).
const candidates = [
  "https://okhantu.co.za",
  "https://taxplanners.co.za",
  "https://smarteraccounting.co.za",
  "https://accounter.co.za",
  "https://blvckrocket.com",
  "https://mgt-accounting.co.za",
  "https://www.patc.co.za",
  "https://mkdsa.co.za",
];

// Fact-area detection: patterns that match each of the five approved facts.
const factChecks = {
  VAT_2300000: /R\s*2[,.]?3\s*(m(illion)?|300[,. ]*000)|2[,.]?3\s*million|2[,. ]*300[,. ]*000/i,
  UIF_17712: /17[,. ]*712|R\s*17[,. ]*712/i,
  ROE: /Return of Earnings|ROE[^a-z]|COIDA/i,
  EMP501: /EMP501/i,
};

async function fetchText(url) {
  try {
    const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (research)" } });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function countSitemap(xml) {
  const m = xml.match(/<loc>/gi);
  return m ? m.length : 0;
}

function stripTags(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

const results = [];
for (const base of candidates) {
  const entry = { base, pageCount: null, factAreas: {}, note: [] };
  const sitemap = await fetchText(base + "/sitemap.xml");
  if (sitemap) {
    entry.pageCount = countSitemap(sitemap);
  } else {
    entry.note.push("no /sitemap.xml");
  }
  // Sample pages: home + sitemap URLs (cap 8).
  let urls = [base + "/"];
  if (sitemap) {
    const locs = [...sitemap.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => m[1].trim()).slice(0, 7);
    urls.push(...locs);
  }
  const seen = new Set();
  let combined = "";
  for (const u of urls) {
    if (seen.has(u)) continue;
    seen.add(u);
    const html = await fetchText(u);
    if (html) combined += " " + stripTags(html);
  }
  for (const [name, re] of Object.entries(factChecks)) {
    entry.factAreas[name] = re.test(combined);
  }
  results.push(entry);
  console.log(JSON.stringify(entry));
}

const passing = results.filter((r) => r.pageCount !== null && r.pageCount >= 10 && r.pageCount <= 60 && Object.values(r.factAreas).filter(Boolean).length >= 2);
console.log("\n=== PASSES CRITERIA (10-60 pages, >=2 fact areas) ===");
for (const r of passing) {
  console.log(r.base, "| pages:", r.pageCount, "| facts:", Object.entries(r.factAreas).filter(([, v]) => v).map(([k]) => k).join(","));
}
