/**
 * DNS record checks via Cloudflare DNS-over-HTTPS (1.1.1.1) — same resolver
 * pattern already used by the SSRF guard, generalized to A/AAAA/MX/TXT.
 * Workers' fetch() exposes no raw DNS API, so DoH is the only option.
 */

export interface DnsCheckResult {
  hasA: boolean;
  hasAAAA: boolean;
  hasMX: boolean;
  hasTXT: boolean;
  records: {
    A: string[];
    AAAA: string[];
    MX: string[];
    TXT: string[];
  };
  note: string;
}

async function queryDoH(hostname: string, type: string, fetchFn: typeof fetch): Promise<string[]> {
  try {
    const res = await fetchFn(
      `https://1.1.1.1/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`,
      { headers: { accept: "application/dns-json" } }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { Answer?: Array<{ type: number; data: string }> };
    return (data.Answer ?? []).map((a) => a.data);
  } catch {
    return [];
  }
}

export async function checkDnsRecords(
  hostname: string,
  fetchFn: typeof fetch = fetch
): Promise<DnsCheckResult> {
  const [a, aaaa, mx, txt] = await Promise.all([
    queryDoH(hostname, "A", fetchFn),
    queryDoH(hostname, "AAAA", fetchFn),
    queryDoH(hostname, "MX", fetchFn),
    queryDoH(hostname, "TXT", fetchFn),
  ]);

  return {
    hasA: a.length > 0,
    hasAAAA: aaaa.length > 0,
    hasMX: mx.length > 0,
    hasTXT: txt.length > 0,
    records: { A: a, AAAA: aaaa, MX: mx, TXT: txt },
    note: "resolved via Cloudflare DNS-over-HTTPS (1.1.1.1)",
  };
}
