// Pin the exact PATC VAT-threshold post URL (public evidence).
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0";
const blog = await (await fetch("https://www.patc.co.za/accounting-tax-blog/", { headers: { "User-Agent": UA } })).text();
const hrefs = [...blog.matchAll(/href="([^"]+)"/gi)].map((m) => m[1]);
const vatUrls = [...new Set(hrefs.filter((u) => /patc\.co\.za\/[^"]*vat/i.test(u) && !/category|tag|page/i.test(u)))];
console.log("PATC VAT-related URLs:", JSON.stringify(vatUrls.slice(0, 5)));
for (const u of vatUrls.slice(0, 2)) {
  const post = await (await fetch(u, { headers: { "User-Agent": UA } })).text();
  const t = post.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const i = t.search(/2[,.]?3\s*million/i);
  console.log("URL:", u);
  console.log("  sentence:", i >= 0 ? t.slice(Math.max(0, i - 90), i + 220) : "(R2.3m not in text)");
}
