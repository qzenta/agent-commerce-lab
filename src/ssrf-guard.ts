/**
 * SSRF guard for runSecuritySnapshot(). Rejects requests targeting
 * private/internal address space, including hostnames that resolve to one
 * (checked via DNS-over-HTTPS, since Workers' fetch() exposes no raw DNS).
 */

export interface HostCheckResult {
  blocked: boolean;
  reason: string | null;
}

const BLOCKED_IPV4_RANGES: Array<{ base: [number, number, number, number]; maskBits: number }> = [
  { base: [10, 0, 0, 0], maskBits: 8 }, // RFC1918
  { base: [172, 16, 0, 0], maskBits: 12 }, // RFC1918
  { base: [192, 168, 0, 0], maskBits: 16 }, // RFC1918
  { base: [127, 0, 0, 0], maskBits: 8 }, // loopback
  { base: [169, 254, 0, 0], maskBits: 16 }, // link-local / cloud metadata (169.254.169.254)
];

const BLOCKED_HOSTNAMES = new Set(["localhost", "localhost.localdomain", "0.0.0.0"]);

function parseIPv4(ip: string): [number, number, number, number] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums as [number, number, number, number];
}

function ipv4ToInt(parts: [number, number, number, number]): number {
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export function isPrivateIPv4(ip: string): boolean {
  const parts = parseIPv4(ip);
  if (!parts) return false;
  const ipInt = ipv4ToInt(parts);
  return BLOCKED_IPV4_RANGES.some(({ base, maskBits }) => {
    const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;
    return (ipInt & mask) === (ipv4ToInt(base) & mask);
  });
}

/** Covers ::1 (loopback), fe80::/10 (link-local), fc00::/7 (unique local), and IPv4-mapped addresses. */
export function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "::1" || normalized === "::") return true;
  if (/^fe[89ab][0-9a-f]?:/.test(normalized)) return true;
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true;
  if (normalized.startsWith("::ffff:")) {
    const v4 = normalized.slice("::ffff:".length);
    return parseIPv4(v4) !== null ? isPrivateIPv4(v4) : false;
  }
  return false;
}

async function resolveViaDoH(hostname: string, fetchFn: typeof fetch): Promise<string[]> {
  const results: string[] = [];
  for (const type of ["A", "AAAA"] as const) {
    const res = await fetchFn(
      `https://1.1.1.1/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`,
      { headers: { accept: "application/dns-json" } }
    );
    if (!res.ok) continue;
    const data = (await res.json()) as { Answer?: Array<{ type: number; data: string }> };
    for (const answer of data.Answer ?? []) {
      if (answer.data) results.push(answer.data);
    }
  }
  return results;
}

/**
 * Checks whether a hostname (from the original URL or a redirect hop) is
 * safe to fetch. Resolves real hostnames via DNS-over-HTTPS and checks every
 * returned address — a public-looking name can still resolve to a private
 * IP (DNS rebinding), so the literal-only check isn't enough on its own.
 */
export async function checkHostnameAllowed(
  hostname: string,
  fetchFn: typeof fetch = fetch
): Promise<HostCheckResult> {
  const host = hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost")) {
    return { blocked: true, reason: `"${hostname}" is a localhost hostname` };
  }

  const v4 = parseIPv4(host);
  if (v4) {
    return isPrivateIPv4(host)
      ? { blocked: true, reason: `IP literal ${host} is in a private/internal range` }
      : { blocked: false, reason: null };
  }

  if (host.includes(":")) {
    return isPrivateIPv6(host)
      ? { blocked: true, reason: `IPv6 literal ${host} is in a private/internal range` }
      : { blocked: false, reason: null };
  }

  try {
    const resolved = await resolveViaDoH(host, fetchFn);
    for (const ip of resolved) {
      if (ip.includes(":") ? isPrivateIPv6(ip) : isPrivateIPv4(ip)) {
        return { blocked: true, reason: `"${hostname}" resolves to internal address ${ip}` };
      }
    }
    return { blocked: false, reason: null };
  } catch {
    // DoH lookup failed — don't block on an infra hiccup; the real fetch()
    // moments later will surface its own DNS error if the name is bogus.
    return { blocked: false, reason: null };
  }
}

/** fetch() with an abortable timeout so a slow/hanging target can't tie up the Worker. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 8000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
