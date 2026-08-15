import { describe, expect, it, vi } from "vitest";
import { checkDnsRecords } from "../src/dns-check";

function makeStubFetch(byType: Record<string, Array<{ type: number; data: string }>>) {
  return vi.fn(async (url: string | URL) => {
    const u = new URL(url.toString());
    const type = u.searchParams.get("type") ?? "";
    const answers = byType[type] ?? [];
    return new Response(JSON.stringify({ Answer: answers }), { status: 200 });
  }) as unknown as typeof fetch;
}

describe("checkDnsRecords", () => {
  it("reports hasA/hasAAAA/hasMX/hasTXT true only when the resolver returns answers", async () => {
    const stub = makeStubFetch({
      A: [{ type: 1, data: "93.184.216.34" }],
      AAAA: [],
      MX: [{ type: 15, data: "10 mail.example.com" }],
      TXT: [{ type: 16, data: "v=spf1 -all" }],
    });

    const result = await checkDnsRecords("example.com", stub);

    expect(result.hasA).toBe(true);
    expect(result.hasAAAA).toBe(false);
    expect(result.hasMX).toBe(true);
    expect(result.hasTXT).toBe(true);
    expect(result.records.A).toEqual(["93.184.216.34"]);
    expect(result.records.AAAA).toEqual([]);
  });

  it("reports all-false with empty record arrays for a domain with no records at all", async () => {
    const stub = makeStubFetch({});
    const result = await checkDnsRecords("no-records-example.invalid", stub);

    expect(result.hasA).toBe(false);
    expect(result.hasAAAA).toBe(false);
    expect(result.hasMX).toBe(false);
    expect(result.hasTXT).toBe(false);
  });

  it("does not throw when the DoH resolver request fails — degrades to no records found", async () => {
    const failingFetch = vi.fn(async () => {
      throw new Error("network error");
    }) as unknown as typeof fetch;

    const result = await checkDnsRecords("example.com", failingFetch);

    expect(result.hasA).toBe(false);
    expect(result.hasAAAA).toBe(false);
    expect(result.hasMX).toBe(false);
    expect(result.hasTXT).toBe(false);
  });

  it("does not throw when the DoH resolver returns a non-OK status", async () => {
    const errorFetch = vi.fn(async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    const result = await checkDnsRecords("example.com", errorFetch);
    expect(result.hasA).toBe(false);
  });
});
