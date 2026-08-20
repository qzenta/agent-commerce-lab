// Gate 5 — targeted claim verification: for each candidate, find the pages that
// state the approved fact areas and print the exact surrounding text (the public
// evidence). Also capture the firm identity from the home page.
const targets = [
  { base: "https://simpsonaccounting.co.za", name: "Simpson Accounting" },
  { base: "https://www.patc.co.za", name: "PATC" },
  { base: "https://mkdsa.co.za", name: "MKD Chartered Accountants" },
  { base: "https://taxplanners.co.za", name: "Tax Planners" },
];

const facts = [
  { key: "VAT_2300000", label: "VAT compulsory threshold R2.3m", re: /R\s*2[,.]?3\s*(m(illion)?|300[,. ]*000)|2[,.]?3\s*million|2[,. ]*300[,. ]*000/i },
  { key: "UIF_17712", label: "UIF monthly ceiling R17,712", re: /17[,. ]*712|R\s*17[,. ]*712/i },
  { key: "ROE_deadline", label: "ROE deadline", re: /Return of Earnings|ROE[^a-z]|COIDA/i },
  { key: "EMP501", label: "EMP501 reconciliation", re: /EMP501/i },
];

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";
async function get(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" } });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}
function text(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ");
}
function snippet(html, re, width = 180) {
  const t = text(html);
  const m = re.exec(t);
  if (!m) return null;
  return t.slice(Math.max(0, m.index - 60), m.index + width).trim();
}

for (const t of targets) {
  console.log("\n===== " + t.name + " (" + t.base + ") =====");
  const homeHtml = await get(t.base + "/");
  if (homeHtml) {
    const t0 = text(homeHtml).slice(0, 220);
    console.log("HOME:", t0);
  }
  // Crawl sitemap URLs (handle index).
  let urls = [];
  const sitemapXml = await get(t.base + "/sitemap.xml");
  if (sitemapXml) {
    const locs = [...sitemapXml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => m[1].trim());
    for (const loc of locs) {
      if (/\.xml$/i.test(loc)) {
        const sub = await get(loc);
        if (sub) urls.push(...[...sub.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => m[1].trim()));
      } else urls.push(loc);
    }
  }
  const seen = new Set();
  for (const u of [...new Set(urls)].slice(0, 45)) {
    if (seen.has(u)) continue;
    seen.add(u);
    const html = await get(u);
    if (!html) continue;
    for (const f of facts) {
      const m = f.re.exec(text(html));
      if (m) {
        console.log(`  [${f.label}] ${u.slice(t.base.length)} | ...${snippet(html, f.re)}`);
      }
    }
  }
}
