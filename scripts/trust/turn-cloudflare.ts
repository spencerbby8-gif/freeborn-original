/**
 * turn-cloudflare.ts — verification harness for the Cloudflare TURN integration.
 *
 * Bundled with esbuild and run under node (see package.json `test:turn`), matching
 * the other scripts/trust/*.ts harnesses. It proves three things without touching
 * the network or a real Cloudflare account:
 *
 *   1. PARSE. `parseCloudflareIceServers` accepts the recorded real response shapes
 *      (current array form + legacy single-object form), drops the port-53 STUN/TURN
 *      URLs Chrome and Firefox refuse, rejects a credentialed-relay-less payload, and
 *      returns null on malformed input — so a bad response can never be reported as a
 *      working relay.
 *   2. FETCH. `fetchCloudflareIceServers` calls the right URL with the right method,
 *      Bearer token and {ttl} body, returns the parsed grant on 2xx, and returns null
 *      (never throws) on 500, on a timeout, and on a malformed body — verified against
 *      a local HTTP double, exactly like pose-e2e exercises its gateway double.
 *   3. CLAMP. TTL is clamped to Cloudflare's documented 60–86400 and configured() is
 *      true only when BOTH key id and token are present.
 *
 * No secret value is used: the double asserts the Authorization header is present and
 * well-formed with a throwaway token, never a real one.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  cloudflareTurnConfigured,
  cloudflareTurnTtl,
  fetchCloudflareIceServers,
  parseCloudflareIceServers,
} from "../../src/lib/turn-credentials";

let pass = 0;
let fail = 0;
function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.error(`  FAIL ${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

/* The real Cloudflare generate-ice-servers payload (urls recorded verbatim from the
   public API; username/credential replaced with throwaways — never a real grant). */
const REAL_PAYLOAD = {
  iceServers: [
    { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] },
    {
      urls: [
        "turn:turn.cloudflare.com:3478?transport=udp",
        "turn:turn.cloudflare.com:3478?transport=tcp",
        "turns:turn.cloudflare.com:5349?transport=tcp",
        "turn:turn.cloudflare.com:53?transport=udp",
        "turn:turn.cloudflare.com:80?transport=tcp",
        "turns:turn.cloudflare.com:443?transport=tcp",
      ],
      username: "1700000000:testuser",
      credential: "dGVzdC1jcmVkZW50aWFs",
    },
  ],
};

async function withDouble(
  handler: (req: { method: string; url: string; auth: string | undefined; body: string }) => Promise<{ status: number; body: string } | void>,
  run: (baseUrl: string, recorded: Array<{ method: string; url: string; auth: string | undefined; body: string }>) => Promise<void>,
): Promise<void> {
  const recorded: Array<{ method: string; url: string; auth: string | undefined; body: string }> = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const rec = { method: req.method ?? "", url: req.url ?? "", auth: req.headers.authorization as string | undefined, body };
      recorded.push(rec);
      void Promise.resolve(handler(rec)).then((out) => {
        if (out === undefined) return; // handler chose not to respond (e.g. timeout test)
        res.writeHead(out.status, { "Content-Type": "application/json" });
        res.end(out.body);
      });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  try {
    await run(`http://127.0.0.1:${port}/keys`, recorded);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const ENV = { FREEBORN_CLOUDFLARE_TURN_KEY_ID: "key-id-123", FREEBORN_CLOUDFLARE_TURN_API_TOKEN: "throwaway-token" };

async function main() {
  console.log("Cloudflare TURN harness");

  // ── 1. PARSE ──────────────────────────────────────────────────────────────
  console.log("[1] parseCloudflareIceServers");
  const parsed = parseCloudflareIceServers(REAL_PAYLOAD);
  check("real array payload parses", parsed !== null);
  const turn = parsed?.iceServers.find((s) => s.username);
  check("credentialed relay preserved", Boolean(turn?.username && turn?.credential));
  check(
    "port-53 turn URL dropped",
    Boolean(turn && !turn.urls.some((u) => /:53(?:\?|$)/.test(u))),
    turn?.urls,
  );
  check(
    "port-53 stun URL dropped",
    Boolean(parsed && parsed.iceServers.every((s) => !s.urls.some((u) => /:53(?:\?|$)/.test(u)))),
  );
  check(
    "usable relay URLs survive (3478/5349/80/443)",
    Boolean(turn && turn.urls.some((u) => u.includes(":443")) && turn.urls.some((u) => u.includes(":3478"))),
    turn?.urls,
  );

  // legacy single-object form
  const legacy = parseCloudflareIceServers({ iceServers: REAL_PAYLOAD.iceServers[1] });
  check("legacy single-object form parses", legacy !== null && Boolean(legacy.iceServers.find((s) => s.username)));

  // relay without credentials is useless → null
  check(
    "credentialed-relay-less payload → null",
    parseCloudflareIceServers({ iceServers: [{ urls: ["turn:turn.cloudflare.com:3478?transport=udp"] }] }) === null,
  );
  // STUN-only (no relay) → null (must not be reported as a relay)
  check(
    "stun-only payload → null",
    parseCloudflareIceServers({ iceServers: [{ urls: ["stun:stun.cloudflare.com:3478"] }] }) === null,
  );
  // malformed
  check("malformed iceServers → null", parseCloudflareIceServers({ iceServers: "nope" }) === null);
  check("missing iceServers → null", parseCloudflareIceServers({}) === null);
  check("non-object → null", parseCloudflareIceServers(null) === null);

  // ── 3. CLAMP / configured (pure, run before the network section) ───────────
  console.log("[3] ttl clamp + configured");
  check("configured requires both", cloudflareTurnConfigured({}) === false && cloudflareTurnConfigured(ENV) === true);
  check("configured false with only key id", cloudflareTurnConfigured({ FREEBORN_CLOUDFLARE_TURN_KEY_ID: "x" }) === false);
  check("ttl default 86400", cloudflareTurnTtl(undefined) === 86_400);
  check("ttl clamps low to 60", cloudflareTurnTtl("5") === 60);
  check("ttl clamps high to 86400", cloudflareTurnTtl("999999") === 86_400);
  check("ttl honours valid value", cloudflareTurnTtl("600") === 600);
  check("ttl falls back on NaN", cloudflareTurnTtl("abc") === 86_400);

  // ── 2. FETCH against a local double ───────────────────────────────────────
  console.log("[2] fetchCloudflareIceServers (local double)");

  // 2a. success + request shape
  await withDouble(
    async () => ({ status: 200, body: JSON.stringify(REAL_PAYLOAD) }),
    async (baseUrl, recorded) => {
      const res = await fetchCloudflareIceServers({ ...ENV, FREEBORN_CLOUDFLARE_TURN_TTL_SECONDS: "600" }, { baseUrl });
      check("success returns a grant", res !== null && res.iceServers.length > 0);
      check("success echoes ttl", res?.ttl === 600);
      const req = recorded[0];
      check("POSTs to generate-ice-servers with key id in path", req?.method === "POST" && req.url === `/keys/${ENV.FREEBORN_CLOUDFLARE_TURN_KEY_ID}/credentials/generate-ice-servers`, req?.url);
      check("sends Bearer token", req?.auth === `Bearer ${ENV.FREEBORN_CLOUDFLARE_TURN_API_TOKEN}`);
      check("sends {ttl} body", req?.body === JSON.stringify({ ttl: 600 }), req?.body);
      check("port-53 dropped end-to-end", Boolean(res && res.iceServers.every((s) => !s.urls.some((u) => /:53(?:\?|$)/.test(u)))));
    },
  );

  // 2b. unconfigured → null without any request
  await withDouble(
    async () => ({ status: 200, body: JSON.stringify(REAL_PAYLOAD) }),
    async (baseUrl, recorded) => {
      const res = await fetchCloudflareIceServers({}, { baseUrl });
      check("unconfigured → null", res === null);
      check("unconfigured makes no request", recorded.length === 0);
    },
  );

  // 2c. 500 → null (never throws)
  await withDouble(
    async () => ({ status: 500, body: "boom" }),
    async (baseUrl) => {
      const res = await fetchCloudflareIceServers(ENV, { baseUrl });
      check("upstream 500 → null", res === null);
    },
  );

  // 2d. malformed 200 body → null
  await withDouble(
    async () => ({ status: 200, body: JSON.stringify({ iceServers: [] }) }),
    async (baseUrl) => {
      const res = await fetchCloudflareIceServers(ENV, { baseUrl });
      check("empty iceServers 200 → null", res === null);
    },
  );

  // 2e. timeout → null (double never responds within the budget)
  await withDouble(
    async () => undefined, // swallow the request: no response → client must time out
    async (baseUrl) => {
      const res = await fetchCloudflareIceServers(ENV, { baseUrl, timeoutMs: 120 });
      check("timeout → null (no hang, no throw)", res === null);
    },
  );

  // 2f. injectable fetchImpl error → null
  const res = await fetchCloudflareIceServers(ENV, {
    fetchImpl: (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch,
  });
  check("fetch rejection → null", res === null);

  console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

void main();
