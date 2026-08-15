/**
 * TLS cipher/version probe.
 *
 * Workers' fetch() does not expose negotiated TLS version or cipher suite to
 * userland — only that a connection succeeded. The only way to observe them
 * from inside a Worker is to open a raw TCP socket (cloudflare:sockets) and
 * do a manual TLS ClientHello, then parse the raw bytes of whatever the
 * server sends back (a ServerHello, or a HelloRetryRequest — both carry the
 * negotiated version/cipher in the same byte layout, so either is enough for
 * identification). We deliberately do NOT complete the handshake (no
 * key exchange, no Finished message) — we only need the first response
 * message, then we close the socket.
 *
 * `cloudflare:sockets` only exists in the Workers runtime, not in the plain
 * Node/vitest environment this repo's test suite runs under — so the import
 * is dynamic and any failure to load it is reported as a real error rather
 * than crashing the test run or faking a result.
 */

export interface TlsProbeResult {
  version: string | null;
  cipherSuite: string | null;
  cipherSuiteId: string | null;
  weak: boolean;
  error: string | null;
}

const CIPHER_NAMES: Record<number, string> = {
  0x1301: "TLS_AES_128_GCM_SHA256",
  0x1302: "TLS_AES_256_GCM_SHA384",
  0x1303: "TLS_CHACHA20_POLY1305_SHA256",
  0xc02b: "ECDHE-ECDSA-AES128-GCM-SHA256",
  0xc02c: "ECDHE-ECDSA-AES256-GCM-SHA384",
  0xc02f: "ECDHE-RSA-AES128-GCM-SHA256",
  0xc030: "ECDHE-RSA-AES256-GCM-SHA384",
  0xcca8: "ECDHE-RSA-CHACHA20-POLY1305",
  0xcca9: "ECDHE-ECDSA-CHACHA20-POLY1305",
  0x009c: "RSA-AES128-GCM-SHA256",
  0x009d: "RSA-AES256-GCM-SHA384",
  0x002f: "RSA-AES128-CBC-SHA",
  0x0035: "RSA-AES256-CBC-SHA",
  0x000a: "RSA-3DES-EDE-CBC-SHA",
};

// No forward secrecy (plain RSA key exchange) or a broken cipher (3DES) —
// flagged regardless of what the header-scoring pass says, since this is a
// transport-layer weakness, not a header misconfiguration.
const WEAK_CIPHERS = new Set([0x002f, 0x0035, 0x000a, 0x009c, 0x009d]);

const VERSION_NAMES: Record<number, string> = {
  0x0301: "TLS 1.0",
  0x0302: "TLS 1.1",
  0x0303: "TLS 1.2",
  0x0304: "TLS 1.3",
};

function u16(n: number): number[] {
  return [(n >> 8) & 0xff, n & 0xff];
}
function u24(n: number): number[] {
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * Builds a minimal-but-valid TLS ClientHello offering TLS 1.3 down to 1.2, with SNI.
 *
 * Offering TLS 1.3 in `supported_versions` requires a real `key_share` —
 * confirmed against live Cloudflare/Google edges during development: without
 * one, they respond with a fatal `no_application_protocol` (0x6d) alert
 * rather than gracefully falling back to TLS 1.2, so a ClientHello that
 * advertises 1.3 without a key share gets rejected outright. A real X25519
 * keypair is generated per probe via Web Crypto; we only need the public key
 * bytes to send — the private key is discarded (the handshake is never
 * completed, we only read the first response message).
 */
async function buildClientHello(hostname: string): Promise<Uint8Array> {
  const hostBytes = new TextEncoder().encode(hostname);

  // Modern-first cipher preference list; includes a few legacy/weak suites
  // at the tail so a server that only supports those still gets an offer
  // it can select from (needed to actually observe if a target is weak).
  const cipherList = [
    0x1301, 0x1302, 0x1303, 0xc02c, 0xc030, 0xc02b, 0xc02f, 0xcca9, 0xcca8, 0x009d, 0x009c, 0x0035, 0x002f, 0x000a,
  ];

  const random = new Uint8Array(32);
  crypto.getRandomValues(random);

  const sniExt = [
    ...u16(0x0000),
    ...u16(hostBytes.length + 5),
    ...u16(hostBytes.length + 3),
    0x00,
    ...u16(hostBytes.length),
    ...hostBytes,
  ];

  const supportedVersionsExt = [...u16(0x002b), ...u16(5), 4, 0x03, 0x04, 0x03, 0x03];

  const supportedGroupsList = [0x00, 0x1d, 0x00, 0x17, 0x00, 0x18]; // x25519, secp256r1, secp384r1
  const supportedGroupsExt = [
    ...u16(0x000a),
    ...u16(2 + supportedGroupsList.length),
    ...u16(supportedGroupsList.length),
    ...supportedGroupsList,
  ];

  const sigAlgsList = [0x04, 0x03, 0x08, 0x04, 0x04, 0x01, 0x05, 0x01, 0x08, 0x05, 0x08, 0x06];
  const sigAlgsExt = [...u16(0x000d), ...u16(2 + sigAlgsList.length), ...u16(sigAlgsList.length), ...sigAlgsList];

  // ALPN — not the fix for the key_share issue above, but standard practice
  // and harmless to include; some edges do use it for routing decisions.
  const alpnProtocols = [2, 0x68, 0x32, 8, 0x68, 0x74, 0x74, 0x70, 0x2f, 0x31, 0x2e, 0x31]; // "h2", "http/1.1"
  const alpnExt = [...u16(0x0010), ...u16(2 + alpnProtocols.length), ...u16(alpnProtocols.length), ...alpnProtocols];

  // key_share — required alongside a TLS 1.3 offer in supported_versions (see
  // function doc comment). x25519 (group 0x001d) is universally supported.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subtle = crypto.subtle as any;
  const keyPair = (await subtle.generateKey({ name: "X25519" }, true, ["deriveBits"])) as CryptoKeyPair;
  const rawPublicKey = new Uint8Array((await subtle.exportKey("raw", keyPair.publicKey)) as ArrayBuffer);
  const keyShareEntry = [0x00, 0x1d, ...u16(rawPublicKey.length), ...rawPublicKey];
  const keyShareExt = [...u16(0x0033), ...u16(2 + keyShareEntry.length), ...u16(keyShareEntry.length), ...keyShareEntry];

  const extensions = [...sniExt, ...supportedVersionsExt, ...supportedGroupsExt, ...sigAlgsExt, ...alpnExt, ...keyShareExt];
  const cipherBytes = cipherList.flatMap(u16);

  const body = [
    0x03,
    0x03, // legacy_version = TLS1.2 (actual version negotiated via supported_versions ext)
    ...random,
    0x00, // session_id length = 0 (no session resumption offered)
    ...u16(cipherBytes.length),
    ...cipherBytes,
    0x01,
    0x00, // compression methods: 1 method, null
    ...u16(extensions.length),
    ...extensions,
  ];

  const handshake = [0x01, ...u24(body.length), ...body];
  const record = [0x16, 0x03, 0x01, ...u16(handshake.length), ...handshake];

  return new Uint8Array(record);
}

type ParsedHello = { kind: "hello"; version: number; cipherSuite: number } | { kind: "alert" } | null;

/** Parses raw TLS record bytes looking for a ServerHello/HelloRetryRequest or an Alert. */
function parseServerHello(bytes: Uint8Array): ParsedHello {
  let offset = 0;
  while (offset + 5 <= bytes.length) {
    const contentType = bytes[offset];
    const recordLen = (bytes[offset + 3] << 8) | bytes[offset + 4];
    const recordStart = offset + 5;
    if (recordStart + recordLen > bytes.length) return null; // incomplete, wait for more bytes

    if (contentType === 0x15) return { kind: "alert" };

    if (contentType === 0x16) {
      let hsOffset = recordStart;
      const recordEnd = recordStart + recordLen;
      while (hsOffset + 4 <= recordEnd) {
        const hsType = bytes[hsOffset];
        const hsLen = (bytes[hsOffset + 1] << 16) | (bytes[hsOffset + 2] << 8) | bytes[hsOffset + 3];
        const hsBodyStart = hsOffset + 4;
        if (hsBodyStart + hsLen > recordEnd) break; // incomplete

        if (hsType === 0x02) {
          // ServerHello or HelloRetryRequest — same field layout for our purposes.
          let p = hsBodyStart;
          const legacyVersion = (bytes[p] << 8) | bytes[p + 1];
          p += 2 + 32; // version + random
          const sessionIdLen = bytes[p];
          p += 1 + sessionIdLen;
          const cipherSuite = (bytes[p] << 8) | bytes[p + 1];
          p += 2;
          p += 1; // compression method

          let negotiatedVersion = legacyVersion;
          const hsBodyEnd = hsBodyStart + hsLen;
          if (p + 2 <= hsBodyEnd) {
            const extLen = (bytes[p] << 8) | bytes[p + 1];
            p += 2;
            const extEnd = Math.min(p + extLen, hsBodyEnd);
            while (p + 4 <= extEnd) {
              const extType = (bytes[p] << 8) | bytes[p + 1];
              const extLen2 = (bytes[p + 2] << 8) | bytes[p + 3];
              const extBodyStart = p + 4;
              if (extType === 0x002b && extLen2 >= 2) {
                negotiatedVersion = (bytes[extBodyStart] << 8) | bytes[extBodyStart + 1];
              }
              p = extBodyStart + extLen2;
            }
          }
          return { kind: "hello", version: negotiatedVersion, cipherSuite };
        }
        hsOffset = hsBodyStart + hsLen;
      }
    }
    offset = recordStart + recordLen;
  }
  return null;
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

export async function probeTls(hostname: string, port = 443, timeoutMs = 5000): Promise<TlsProbeResult> {
  // Typed loosely (rather than importing the full cloudflare:sockets ambient
  // types) since this import is dynamic and only ever resolves inside the
  // Workers runtime — the try/catch below is the real type/availability guard.
  let connect: (
    address: string,
    opts: { secureTransport: "off" }
  ) => {
    writable: WritableStream<Uint8Array>;
    readable: ReadableStream<Uint8Array>;
    close: () => Promise<void>;
  };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ({ connect } = (await import("cloudflare:sockets")) as any);
  } catch {
    return {
      version: null,
      cipherSuite: null,
      cipherSuiteId: null,
      weak: false,
      error: "cloudflare:sockets unavailable in this runtime (expected outside the Workers runtime, e.g. local test env)",
    };
  }

  let socket: ReturnType<typeof connect> | null = null;
  try {
    socket = connect(`${hostname}:${port}`, { secureTransport: "off" });
    const writer = socket.writable.getWriter();
    const reader = socket.readable.getReader();

    await writer.write(await buildClientHello(hostname));

    const chunks: Uint8Array[] = [];
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const remaining = deadline - Date.now();
      const readResult = await Promise.race([
        reader.read(),
        new Promise<{ value: undefined; done: true }>((resolve) =>
          setTimeout(() => resolve({ value: undefined, done: true }), Math.max(0, remaining))
        ),
      ]);

      if (readResult.done || !readResult.value) break;
      chunks.push(readResult.value);

      const parsed = parseServerHello(concatChunks(chunks));
      if (parsed?.kind === "alert") {
        return {
          version: null,
          cipherSuite: null,
          cipherSuiteId: null,
          weak: false,
          error: "target sent a TLS alert in response to the probe ClientHello",
        };
      }
      if (parsed?.kind === "hello") {
        return {
          version: VERSION_NAMES[parsed.version] ?? `unknown (0x${parsed.version.toString(16)})`,
          cipherSuiteId: `0x${parsed.cipherSuite.toString(16).padStart(4, "0")}`,
          cipherSuite: CIPHER_NAMES[parsed.cipherSuite] ?? `unknown cipher (0x${parsed.cipherSuite.toString(16)})`,
          weak: WEAK_CIPHERS.has(parsed.cipherSuite),
          error: null,
        };
      }
    }

    return {
      version: null,
      cipherSuite: null,
      cipherSuiteId: null,
      weak: false,
      error: "no ServerHello received within timeout",
    };
  } catch (err) {
    return {
      version: null,
      cipherSuite: null,
      cipherSuiteId: null,
      weak: false,
      error: err instanceof Error ? err.message : "TLS probe failed",
    };
  } finally {
    try {
      await socket?.close();
    } catch {
      // best-effort cleanup
    }
  }
}
