// Compare custom domain vs workers.dev production responses (edge propagation check).
const urls = ["https://sitehealth.qzenta.com", "https://qzenta-security-snapshot.qzenta.workers.dev"];
for (const base of urls) {
  const spec = await fetch(base + "/openapi.json");
  const text = await spec.text();
  const disc = await fetch(base + "/");
  const discJson = await disc.json();
  const hasContent = text.includes('"content"') && text.includes("site-scoped content-accuracy");
  console.log(base);
  console.log("  openapi status:", spec.status, "| hasContentParam:", hasContent, "| len:", text.length);
  console.log("  discovery endpoints:", JSON.stringify(discJson.endpoints ?? []));
}
