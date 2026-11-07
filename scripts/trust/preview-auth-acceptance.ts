import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { resolveDatabaseConnection } from "../../src/db/tls";

type User = { label: string; id: string; email: string; password: string; token: string; deleted: boolean; deletionToken?: string };
type Result = { id: string; pass: boolean; detail?: string | number | boolean };

const projectRef = process.env.PREVIEW_PROJECT_REF!;
const publishable = process.env.PREVIEW_PUBLISHABLE_KEY!;
const admin = readFileSync(process.env.PREVIEW_ADMIN_FILE!, "utf8").trim();
const runtimePassword = readFileSync(process.env.PREVIEW_RUNTIME_PASSWORD_FILE!, "utf8").trim();
const poolerHost = process.env.PREVIEW_POOLER_HOST!;
const appBase = process.env.APP_BASE_URL ?? "http://127.0.0.1:3000";
const appOrigin = process.env.APP_ORIGIN ?? appBase;
const supabaseUrl = `https://${projectRef}.supabase.co`;
const runId = randomUUID().slice(0, 8);
const users: User[] = [];
const results: Result[] = [];
const realtimeClients: SupabaseClient[] = [];
const realtimeErrors = new WeakMap<RealtimeChannel, string>();
let pool: Pool;

function check(id: string, pass: boolean, detail?: string | number | boolean) {
  results.push({ id, pass, ...(detail === undefined ? {} : { detail }) });
  console.log(`${pass ? "ok" : "FAIL"} ${id}${detail === undefined ? "" : ` (${detail})`}`);
}

async function request(url: string, init: RequestInit = {}, auth: "user" | "admin" | "publishable" | "none" = "none", token?: string) {
  const headers = new Headers(init.headers);
  if (auth === "admin") {
    headers.set("apikey", admin);
    headers.set("Authorization", `Bearer ${admin}`);
  } else if (auth === "publishable") {
    headers.set("apikey", publishable);
  } else if (auth === "user") {
    headers.set("apikey", publishable);
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(url, { ...init, headers, signal: AbortSignal.timeout(20_000) });
}

async function jsonRequest(url: string, init: RequestInit = {}, auth: "user" | "admin" | "publishable" | "none" = "none", token?: string) {
  const response = await request(url, init, auth, token);
  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { status: response.status, body, headers: response.headers };
}

async function createSyntheticUser(label: string) {
  const password = `${randomBytes(30).toString("base64url")}aA1!`;
  const email = `fb-${runId}-${label}@example.invalid`;
  const { status, body } = await jsonRequest(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: `Preview ${label.toUpperCase()}` } }),
  }, "admin");
  check(`create_confirmed_synthetic_${label}`, status === 200 && typeof body?.id === "string", status);
  if (status !== 200 || !body?.id) throw new Error(`synthetic user ${label} creation failed`);
  const signin = await jsonRequest(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }, "publishable");
  check(`password_signin_${label}`, signin.status === 200 && typeof signin.body?.access_token === "string", signin.status);
  if (signin.status !== 200 || !signin.body?.access_token) throw new Error(`synthetic user ${label} sign-in failed`);
  users.push({ label, id: body.id, email, password, token: signin.body.access_token, deleted: false });
}

async function api(user: User | null, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (init.method && init.method !== "GET") headers.set("Origin", appOrigin);
  return jsonRequest(`${appBase}${path}`, { ...init, headers }, user ? "user" : "none", user?.token);
}

async function realtime(token?: string) {
  const client = createClient(supabaseUrl, publishable, {
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    accessToken: token ? async () => token : undefined,
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { apikey: publishable }, timeout: 8_000 },
  });
  if (token) await client.realtime.setAuth(token);
  realtimeClients.push(client);
  return client;
}

async function subscribe(channel: RealtimeChannel, timeoutMs = 10_000): Promise<string> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) { settled = true; resolve("TEST_TIMEOUT"); }
    }, timeoutMs);
    channel.subscribe((status, error) => {
      if (error) realtimeErrors.set(channel, error.message.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "<uuid>").slice(0, 180));
      if (settled) return;
      if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        settled = true;
        clearTimeout(timer);
        resolve(status);
      }
    });
  });
}

function subscriptionError(channel: RealtimeChannel): string {
  return realtimeErrors.get(channel) ?? "no_error_detail";
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return predicate();
}

async function removeChannel(client: SupabaseClient, channel: RealtimeChannel) {
  try { await client.removeChannel(channel); } catch { /* already closed */ }
}

async function processDeletionQueues() {
  for (let round = 0; round < 5; round += 1) {
    const claimed = await jsonRequest(`${supabaseUrl}/rest/v1/rpc/fb14_claim_cleanup_jobs`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ p_limit: 20 }),
    }, "admin");
    check(`deletion_claim_round_${round}`, claimed.status === 200 && Array.isArray(claimed.body), claimed.status);
    if (!Array.isArray(claimed.body) || claimed.body.length === 0) return;
    for (const job of claimed.body) {
      const owned = users.some((user) => user.id === job.deletion_account_id);
      check("claimed_job_belongs_to_synthetic_user", owned);
      if (!owned) throw new Error("unexpected non-synthetic deletion job");
      const listing = await jsonRequest(`${supabaseUrl}/storage/v1/object/list/${job.bucket}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: job.owner_prefix, limit: 100, offset: 0 }),
      }, "admin");
      check("synthetic_storage_prefix_is_empty", listing.status === 200 && Array.isArray(listing.body) && listing.body.length === 0, listing.status);
      if (listing.status !== 200 || !Array.isArray(listing.body) || listing.body.length !== 0) throw new Error("unexpected synthetic storage object");
      const completed = await jsonRequest(`${supabaseUrl}/rest/v1/rpc/fb14_complete_cleanup_job`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ p_job_id: job.id, p_lease_token: job.lease_token }),
      }, "admin");
      check("deletion_job_completed_with_lease", completed.status === 200 && completed.body === true, completed.status);
    }
  }
  throw new Error("deletion queue did not drain within five rounds");
}

async function cleanup() {
  for (const client of realtimeClients) {
    try { await client.removeAllChannels(); } catch { /* ignore */ }
    try { await client.realtime.disconnect(); } catch { /* ignore */ }
  }
  if (pool) {
    const ids = users.map((user) => user.id);
    if (ids.length) {
      const statements = [
        `delete from public.message_reactions where user_id = any($1::uuid[]) or message_id in (select id from public.messages where sender_id = any($1::uuid[]))`,
        `delete from public.messages where sender_id = any($1::uuid[]) or match_id in (select id from public.matches where user_a = any($1::uuid[]) or user_b = any($1::uuid[]))`,
        `delete from public.chat_signals where match_id in (select id from public.matches where user_a = any($1::uuid[]) or user_b = any($1::uuid[]))`,
        `delete from public.call_sessions where caller_id = any($1::uuid[]) or callee_id = any($1::uuid[])`,
        `delete from public.chat_media where sender_id = any($1::uuid[])`,
        `delete from public.matches where user_a = any($1::uuid[]) or user_b = any($1::uuid[])`,
        `delete from public.user_matches where user_a = any($1::uuid[]) or user_b = any($1::uuid[])`,
        `delete from public.user_swipes where liker_id = any($1::uuid[]) or liked_id = any($1::uuid[])`,
        `delete from public.blocked_users where blocker_id = any($1::uuid[]) or blocked_id = any($1::uuid[])`,
        `delete from public.profile_photos where user_id = any($1::uuid[])`,
        `delete from public.discovery_preferences where user_id = any($1::uuid[])`,
        `delete from public.notification_preferences where user_id = any($1::uuid[])`,
        `delete from public.user_private_settings where user_id = any($1::uuid[])`,
        `delete from public.user_private_locations where user_id = any($1::uuid[])`,
        `delete from public.user_trust_history where user_id = any($1::uuid[])`,
        `delete from public.user_profiles where id = any($1::uuid[])`,
        `delete from public.accounts where id = any($1::uuid[])`,
        `delete from public.storage_cleanup_jobs where deletion_account_id = any($1::uuid[])`,
        `delete from public.account_deletion_requests where account_id = any($1::uuid[])`,
      ];
      for (const sql of statements) {
        try { await pool.query(sql, [ids]); } catch { check("cleanup_sql_completed", false); }
      }
      const residual = await pool.query(
        `select (select count(*)::int from public.accounts where id=any($1::uuid[])) as accounts,
                (select count(*)::int from public.user_profiles where id=any($1::uuid[])) as profiles,
                (select count(*)::int from public.matches where user_a=any($1::uuid[]) or user_b=any($1::uuid[])) as matches,
                (select count(*)::int from public.storage_cleanup_jobs where deletion_account_id=any($1::uuid[])) as jobs,
                (select count(*)::int from public.account_deletion_requests where account_id=any($1::uuid[])) as requests`,
        [ids],
      );
      const left = residual.rows[0];
      check("synthetic_database_rows_removed", Object.values(left).every((value) => value === 0), JSON.stringify(left));
    }
    await pool.end();
  }
  for (const user of users) {
    if (user.deleted) continue;
    const response = await request(`${supabaseUrl}/auth/v1/admin/users/${user.id}`, { method: "DELETE" }, "admin").catch(() => null);
    check(`synthetic_auth_cleanup_${user.label}`, response?.status === 204 || response?.status === 404 || response?.status === 200, response?.status ?? "network_error");
  }
}

async function main() {
  const dsn = `postgresql://${encodeURIComponent(`freeborn_runtime.${projectRef}`)}:${encodeURIComponent(runtimePassword)}@${poolerHost}:6543/postgres?sslmode=require&pgbouncer=true`;
  const connection = resolveDatabaseConnection(dsn, { vercelEnv: "preview" });
  pool = new Pool({ connectionString: connection.connectionString, ssl: connection.ssl, max: 2, connectionTimeoutMillis: 8_000 });
  try {
    for (const label of ["a", "b", "c"]) await createSyntheticUser(label);
    const [a, b, c] = users;
    for (const user of users) {
      const response = await api(user, "/api/chat/matches");
      check(`member_bootstrap_${user.label}`, response.status === 200 && Array.isArray(response.body?.matches), response.status);
    }
    const account = await api(a, "/api/account");
    check("account_facts_and_auth_bridge", account.status === 200 && typeof account.body?.activeSignIns === "number" && typeof account.body?.createdAt === "string", account.status);
    const settings = await api(a, "/api/settings");
    check("member_settings_read", settings.status === 200 && typeof settings.body?.account?.email === "string", settings.status);

    const [userA, userB] = [a.id, b.id].sort();
    await pool.query(`insert into public.user_swipes(liker_id,liked_id,action) values($1,$2,'like'),($2,$1,'like') on conflict do nothing`, [userA, userB]);
    const started = await api(a, "/api/chat/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ with: b.id }) });
    const matchId = started.body?.matchId;
    check("participant_match_creation", started.status === 200 && typeof matchId === "string", started.status);
    if (!matchId) throw new Error("match creation failed");
    const nonMatch = await api(c, "/api/chat/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ with: a.id }) });
    check("non_mutual_like_cannot_start", nonMatch.status === 409, nonMatch.status);

    const sent = await api(a, "/api/chat/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ match: matchId, text: `synthetic-${runId}` }) });
    check("participant_message_send", sent.status === 200 && typeof sent.body?.message?.id === "string", sent.status);
    const readB = await api(b, `/api/chat/messages?match=${matchId}`);
    check("participant_message_read", readB.status === 200 && readB.body?.messages?.length === 1, readB.status);
    const readC = await api(c, `/api/chat/messages?match=${matchId}`);
    check("nonparticipant_message_read_denied", readC.status === 404, readC.status);

    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4S8AAAAASUVORK5CYII=", "base64");
    const form = new FormData();
    form.set("file", new File([png], "pixel.png", { type: "image/png" }));
    form.set("kind", "image");
    form.set("match", matchId);
    const uploaded = await api(a, "/api/chat/media", { method: "POST", body: form });
    const mediaId = uploaded.body?.id;
    check("participant_media_upload", uploaded.status === 200 && typeof mediaId === "string", uploaded.status);
    if (mediaId) {
      const mediaB = await request(`${appBase}/api/chat/media/${mediaId}`, {}, "user", b.token);
      const bytes = await mediaB.arrayBuffer();
      check("participant_media_read_private", mediaB.status === 200 && bytes.byteLength === png.byteLength && mediaB.headers.get("cache-control") === "private, no-store", mediaB.status);
      const mediaC = await api(c, `/api/chat/media/${mediaId}`);
      check("nonparticipant_media_read_denied", mediaC.status === 404, mediaC.status);
      const mediaAnon = await api(null, `/api/chat/media/${mediaId}`);
      check("anonymous_media_read_denied", mediaAnon.status === 401, mediaAnon.status);
    }

    const call = await api(a, "/api/calls/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ matchId, kind: "voice" }) });
    const callId = call.body?.id;
    check("participant_call_issued", call.status === 200 && typeof callId === "string", call.status);
    if (callId) {
      const callB = await api(b, `/api/calls/session/${callId}`);
      check("participant_call_read", callB.status === 200, callB.status);
      const callC = await api(c, `/api/calls/session/${callId}`);
      check("nonparticipant_call_read_denied", callC.status === 404, callC.status);

      const [clientA, clientB, clientC, clientAnon] = await Promise.all([realtime(a.token), realtime(b.token), realtime(c.token), realtime()]);
      let callReceived = false;
      const channelB = clientB.channel(`fb-call:${callId}`, { config: { private: true, broadcast: { self: false, ack: true } } })
        .on("broadcast", { event: "preview_ping" }, () => { callReceived = true; });
      const channelA = clientA.channel(`fb-call:${callId}`, { config: { private: true, broadcast: { self: false, ack: true } } });
      const [statusA, statusB] = await Promise.all([subscribe(channelA), subscribe(channelB)]);
      check("participant_private_call_subscribe_a", statusA === "SUBSCRIBED", statusA);
      check("participant_private_call_subscribe_b", statusB === "SUBSCRIBED", statusB);
      if (statusA === "SUBSCRIBED" && statusB === "SUBSCRIBED") {
        await channelA.send({ type: "broadcast", event: "preview_ping", payload: { runId } });
        check("participant_private_call_broadcast", await waitFor(() => callReceived, 6_000));
      }
      const channelC = clientC.channel(`fb-call:${callId}`, { config: { private: true, broadcast: { self: false, ack: true } } });
      check("nonparticipant_private_call_denied", (await subscribe(channelC)) !== "SUBSCRIBED");
      const channelAnon = clientAnon.channel(`fb-call:${callId}`, { config: { private: true, broadcast: { self: false, ack: true } } });
      check("anonymous_private_call_denied", (await subscribe(channelAnon)) !== "SUBSCRIBED");

      const ringReadB = await jsonRequest(`${supabaseUrl}/rest/v1/rpc/can_use_call_topic`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ p_topic: `fb-ring:${b.id}`, p_write: false }),
      }, "user", b.token);
      const ringWriteA = await jsonRequest(`${supabaseUrl}/rest/v1/rpc/can_use_call_topic`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ p_topic: `fb-ring:${b.id}`, p_write: true }),
      }, "user", a.token);
      check("callee_ring_read_predicate", ringReadB.status === 200 && ringReadB.body === true, `${ringReadB.status}/${ringReadB.body}`);
      check("caller_ring_write_predicate", ringWriteA.status === 200 && ringWriteA.body === true, `${ringWriteA.status}/${ringWriteA.body}`);

      let ringReceived = false;
      const ringB = clientB.channel(`fb-ring:${b.id}`, { config: { private: true, broadcast: { self: false, ack: true } } })
        .on("broadcast", { event: "preview_ring" }, () => { ringReceived = true; });
      const ringStatusB = await subscribe(ringB);
      check("callee_ring_receive_subscribe", ringStatusB === "SUBSCRIBED", `${ringStatusB}: ${subscriptionError(ringB)}`);
      const ringA = clientA.channel(`fb-ring:${b.id}`, { config: { private: true, broadcast: { self: false, ack: true } } });
      const ringStatusA = await subscribe(ringA);
      check("caller_ring_receive_denied", ringStatusA !== "SUBSCRIBED", `${ringStatusA}: ${subscriptionError(ringA)}`);
      await removeChannel(clientA, ringA);
      if (ringStatusB === "SUBSCRIBED") {
        const ringSendA = clientA.channel(`fb-ring:${b.id}`, { config: { private: true } });
        try {
          const sentRing = await ringSendA.httpSend("preview_ring", { runId });
          check("caller_ring_rest_insert", sentRing.success === true);
          check("participant_ring_broadcast", await waitFor(() => ringReceived, 6_000));
        } catch {
          check("caller_ring_rest_insert", false, "request_rejected");
        } finally {
          await removeChannel(clientA, ringSendA);
        }
      }
      const ringC = clientC.channel(`fb-ring:${b.id}`, { config: { private: true, broadcast: { self: false, ack: true } } });
      check("nonparticipant_ring_denied", (await subscribe(ringC)) !== "SUBSCRIBED");

      const ended = await api(a, `/api/calls/session/${callId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "end" }) });
      check("participant_call_end", ended.status === 200, ended.status);
      for (const [client, channel] of [[clientA, channelA], [clientB, channelB], [clientC, channelC], [clientAnon, channelAnon], [clientA, ringA], [clientB, ringB], [clientC, ringC]] as const) await removeChannel(client, channel);
    }

    const [dbB, dbC] = await Promise.all([realtime(b.token), realtime(c.token)]);
    let signalB: string | null = null, signalC: string | null = null;
    const dbChannelB = dbB.channel(`preview-db-b-${runId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_signals", filter: `match_id=eq.${matchId}` }, (payload) => { signalB = String(payload.new?.match_id ?? "missing_match"); });
    const dbChannelC = dbC.channel(`preview-db-c-${runId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_signals", filter: `match_id=eq.${matchId}` }, (payload) => { signalC = String(payload.new?.match_id ?? "missing_match"); });
    const [dbStatusB, dbStatusC] = await Promise.all([subscribe(dbChannelB), subscribe(dbChannelC)]);
    check("realtime_database_participant_subscription", dbStatusB === "SUBSCRIBED", dbStatusB);
    check("realtime_database_nonparticipant_transport", dbStatusC === "SUBSCRIBED" || dbStatusC === "CHANNEL_ERROR", dbStatusC);
    const second = await api(a, "/api/chat/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ match: matchId, text: `signal-${runId}` }) });
    check("second_message_for_realtime", second.status === 200, second.status);
    const storedSignals = await jsonRequest(`${supabaseUrl}/rest/v1/chat_signals?select=id,match_id&match_id=eq.${matchId}`, {}, "admin");
    const participantSignals = await jsonRequest(`${supabaseUrl}/rest/v1/chat_signals?select=id,match_id&match_id=eq.${matchId}`, {}, "user", b.token);
    const nonparticipantSignals = await jsonRequest(`${supabaseUrl}/rest/v1/chat_signals?select=id,match_id&match_id=eq.${matchId}`, {}, "user", c.token);
    const participantPredicate = await jsonRequest(`${supabaseUrl}/rest/v1/rpc/is_match_participant`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ p_match: matchId }),
    }, "user", b.token);
    const nonparticipantPredicate = await jsonRequest(`${supabaseUrl}/rest/v1/rpc/is_match_participant`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ p_match: matchId }),
    }, "user", c.token);
    check("chat_signal_durably_stored", storedSignals.status === 200 && Array.isArray(storedSignals.body) && storedSignals.body.length > 0, storedSignals.status);
    check("participant_chat_signal_rest_read", participantSignals.status === 200 && Array.isArray(participantSignals.body) && participantSignals.body.length > 0, participantSignals.status);
    check("nonparticipant_chat_signal_rest_denied", nonparticipantSignals.status === 200 && Array.isArray(nonparticipantSignals.body) && nonparticipantSignals.body.length === 0, nonparticipantSignals.status);
    check("participant_chat_signal_predicate", participantPredicate.status === 200 && participantPredicate.body === true, `${participantPredicate.status}/${participantPredicate.body}`);
    check("nonparticipant_chat_signal_predicate", nonparticipantPredicate.status === 200 && nonparticipantPredicate.body === false, `${nonparticipantPredicate.status}/${nonparticipantPredicate.body}`);
    const gotB = await waitFor(() => signalB !== null, 12_000);
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    check("participant_database_signal_received", gotB && signalB === matchId, signalB ?? "none");
    check("nonparticipant_database_signal_not_received", signalC === null, signalC ?? "none");
    await removeChannel(dbB, dbChannelB); await removeChannel(dbC, dbChannelC);

    for (const user of users) {
      const deleted = await api(user, "/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete" }) });
      const accepted = deleted.status === 202 && deleted.body?.completed === false && typeof deleted.body?.deletionToken === "string";
      check(`account_deletion_accepted_${user.label}`, accepted, deleted.status);
      if (accepted) { user.deleted = true; user.deletionToken = deleted.body.deletionToken; }
    }
    if (users.every((user) => user.deleted)) {
      await processDeletionQueues();
      for (const user of users) {
        const status = await api(null, `/api/account/deletion-status?token=${user.deletionToken}`);
        check(`deletion_public_status_completed_${user.label}`, status.status === 200 && status.body?.status === "completed" && status.body?.completed === true && !("accountId" in (status.body ?? {})), status.status);
        const oldToken = await jsonRequest(`${supabaseUrl}/auth/v1/user`, {}, "user", user.token);
        check(`deleted_auth_token_rejected_${user.label}`, oldToken.status === 401 || oldToken.status === 403, oldToken.status);
      }
    }
  } finally {
    await cleanup();
  }
}

main()
  .then(() => {
    const failed = results.filter((result) => !result.pass);
    console.log(JSON.stringify({ status: failed.length ? "fail" : "pass", passed: results.length - failed.length, failed: failed.length, results }, null, 2));
    if (failed.length) process.exitCode = 1;
  })
  .catch((error) => {
    console.log(JSON.stringify({ status: "harness_error", error: error instanceof Error ? error.message.slice(0, 160) : "unknown", results }, null, 2));
    process.exitCode = 1;
  });
