import { describe, expect, it, vi } from "vitest";
import { checkHostnameAllowed, isPrivateIPv4, isPrivateIPv6 } from "../src/ssrf-guard";

describe("isPrivateIPv4", () => {
  it("blocks RFC1918 and loopback/link-local ranges", () => {
    expect(isPrivateIPv4("10.1.2.3")).toBe(true);
    expect(isPrivateIPv4("172.16.0.1")).toBe(true);
    expect(isPrivateIPv4("172.31.255.255")).toBe(true);
    expect(isPrivateIPv4("192.168.50.1")).toBe(true);
    expect(isPrivateIPv4("127.0.0.1")).toBe(true);
    expect(isPrivateIPv4("169.254.169.254")).toBe(true); // cloud metadata endpoint
  });

  it("does not block adjacent public ranges", () => {
    expect(isPrivateIPv4("172.15.255.255")).toBe(false);
    expect(isPrivateIPv4("172.32.0.0")).toBe(false);
    expect(isPrivateIPv4("8.8.8.8")).toBe(false);
    expect(isPrivateIPv4("93.184.216.34")).toBe(false); // example.com
  });
});

describe("isPrivateIPv6", () => {
  it("blocks loopback, link-local, and unique-local", () => {
    expect(isPrivateIPv6("::1")).toBe(true);
    expect(isPrivateIPv6("fe80::1")).toBe(true);
    expect(isPrivateIPv6("fc00::1")).toBe(true);
    expect(isPrivateIPv6("fd12:3456::1")).toBe(true);
  });

  it("does not block public IPv6", () => {
    expect(isPrivateIPv6("2606:4700:4700::1111")).toBe(false); // 1.1.1.1
  });
});

describe("checkHostnameAllowed", () => {
  it("blocks localhost by name", async () => {
    const result = await checkHostnameAllowed("localhost");
    expect(result.blocked).toBe(true);
  });

  it("blocks IP literals in private ranges without a DNS lookup", async () => {
    const fetchFn = vi.fn();
    const result = await checkHostnameAllowed("10.0.0.5", fetchFn);
    expect(result.blocked).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("allows a public IP literal", async () => {
    const fetchFn = vi.fn();
    const result = await checkHostnameAllowed("93.184.216.34", fetchFn);
    expect(result.blocked).toBe(false);
  });

  it("blocks a hostname that resolves to a private address (DNS rebinding)", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ Answer: [{ type: 1, data: "127.0.0.1" }] }), {
        status: 200,
      })
    );
    const result = await checkHostnameAllowed("evil.example.com", fetchFn as unknown as typeof fetch);
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/resolves to internal address/);
  });

  it("allows a hostname that resolves only to public addresses", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ Answer: [{ type: 1, data: "93.184.216.34" }] }), {
        status: 200,
      })
    );
    const result = await checkHostnameAllowed("example.com", fetchFn as unknown as typeof fetch);
    expect(result.blocked).toBe(false);
  });

  it("fails open (does not block) if the DoH lookup itself errors", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("network down");
    });
    const result = await checkHostnameAllowed("example.com", fetchFn as unknown as typeof fetch);
    expect(result.blocked).toBe(false);
  });
});
