// Gate 3 verification fixture — serves static HTML with a deliberately wrong
// UIF figure (R1 476 vs the approved R17,712) and a wrong ROE deadline
// (31 March vs the approved 30 June), plus a correct VAT threshold. See
// fixture-worker/wrangler.jsonc for scope notes.
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const page = (body: string) =>
      new Response(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>SiteHealth fixture</title></head><body>${body}</body></html>`,
        { headers: { "content-type": "text/html; charset=utf-8" } }
      );

    if (url.pathname === "/sitemap.xml") {
      const loc = (p: string) => `<url><loc>${url.origin}${p}</loc></url>`;
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${loc("/")}${loc("/faq")}${loc("/about")}</urlset>`,
        { headers: { "content-type": "application/xml" } }
      );
    }
    if (url.pathname === "/faq") {
      return page("<h1>FAQ</h1><p>UIF is capped at R17,712 per month.</p>");
    }
    if (url.pathname === "/about") {
      return page("<h1>About</h1><p>The ROE (Return of Earnings) deadline is 31 March.</p>");
    }
    // Home: CORRECT VAT threshold (must be clean) + WRONG UIF figure (must be
    // critical) + links for link-based discovery fallback.
    return page(
      "<h1>Home</h1>" +
        "<p>You must register for VAT when your taxable supplies exceed R2,300,000.</p>" +
        "<p>UIF is capped at R1 476 per month.</p>" +
        '<a href="/faq">FAQ</a> <a href="/about">About</a>'
    );
  },
} satisfies ExportedHandler;
