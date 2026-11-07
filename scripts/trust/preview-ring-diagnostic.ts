import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";

const ref = process.env.PREVIEW_PROJECT_REF!;
const publishable = process.env.PREVIEW_PUBLISHABLE_KEY!;
const admin = readFileSync(process.env.PREVIEW_ADMIN_FILE!, "utf8").trim();
const url = `https://${ref}.supabase.co`;
const run = randomUUID().slice(0, 8);
const email = `fb-ring-${run}@example.invalid`;
const password = `${randomBytes(30).toString("base64url")}aA1!`;
let userId = "";
let client: ReturnType<typeof createClient> | null = null;

function clean(value: unknown) {
  return String(value ?? "")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/eyJ[A-Za-z0-9_.-]+/g, "<jwt>")
    .slice(0, 300);
}

async function subscribe(channel: RealtimeChannel) {
  return new Promise<{ status: string; error: string }>((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) { done = true; resolve({ status: "TEST_TIMEOUT", error: "" }); }
    }, 8_000);
    channel.subscribe((status, error) => {
      if (done || !["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) return;
      done = true;
      clearTimeout(timer);
      resolve({ status, error: clean(error?.message) });
    });
  });
}

try {
  const created = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: admin, Authorization: `Bearer ${admin}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
    signal: AbortSignal.timeout(20_000),
  });
  const createdBody = await created.json();
  if (created.status !== 200 || !createdBody.id) throw new Error(`create failed ${created.status}`);
  userId = createdBody.id;
  const signin = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: publishable, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(20_000),
  });
  const session = await signin.json();
  if (signin.status !== 200 || !session.access_token) throw new Error(`signin failed ${signin.status}`);
  client = createClient(url, publishable, {
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    accessToken: async () => session.access_token,
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { apikey: publishable }, timeout: 8_000 },
  });
  await client.realtime.setAuth(session.access_token);
  for (const write of [false, true]) {
    const response = await fetch(`${url}/rest/v1/rpc/can_use_call_topic`, {
      method: "POST",
      headers: { apikey: publishable, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_topic: `fb-ring:${userId}`, p_write: write }),
      signal: AbortSignal.timeout(20_000),
    });
    console.log(`predicate write=${write} status=${response.status} body=${clean(await response.text())}`);
  }
  const variants = [
    ["ack_true", { private: true, broadcast: { self: false, ack: true } }],
    ["ack_false", { private: true, broadcast: { self: false, ack: false } }],
    ["default", { private: true }],
  ] as const;
  for (const [name, config] of variants) {
    const channel = client.channel(`fb-ring:${userId}`, { config });
    const result = await subscribe(channel);
    console.log(`${name} status=${result.status} error=${result.error || "none"}`);
    await client.removeChannel(channel);
  }
} catch (error) {
  console.error(clean(error instanceof Error ? error.message : error));
  process.exitCode = 1;
} finally {
  if (client) {
    try { await client.removeAllChannels(); } catch { /* ignore */ }
    try { await client.realtime.disconnect(); } catch { /* ignore */ }
  }
  if (userId) {
    const response = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
      method: "DELETE", headers: { apikey: admin, Authorization: `Bearer ${admin}` }, signal: AbortSignal.timeout(20_000),
    }).catch(() => null);
    console.log(`cleanup=${response?.status ?? "network_error"}`);
    if (!response || ![200, 204, 404].includes(response.status)) process.exitCode = 1;
  }
}
