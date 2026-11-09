import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { Pool } from "pg";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { resolveDatabaseConnection } from "../../src/db/tls";

type User = { label: string; id: string; email: string; password: string; token: string; deleted: boolean; deletionToken?: string };
type Result = { id: string; pass: boolean; detail?: string | number | boolean };

const projectRef = process.env.PREVIEW_PROJECT_REF!;
const publishable = process.env.PREVIEW_PUBLISHABLE_KEY!;
const publicSignup = process.env.PREVIEW_PUBLIC_SIGNUP === "1";
const deletionStateFile = process.env.PREVIEW_DELETION_STATE_FILE;
const admin = process.env.PREVIEW_ADMIN_FILE ? readFileSync(process.env.PREVIEW_ADMIN_FILE, "utf8").trim() : "";
const runtimePassword = process.env.PREVIEW_RUNTIME_PASSWORD_FILE ? readFileSync(process.env.PREVIEW_RUNTIME_PASSWORD_FILE, "utf8").trim() : "";
const poolerHost = process.env.PREVIEW_POOLER_HOST ?? "";
if (!publicSignup && (!admin || !runtimePassword || !poolerHost)) throw new Error("privileged acceptance requires admin/runtime inputs");
if (publicSignup && !deletionStateFile) throw new Error("public signup acceptance requires PREVIEW_DELETION_STATE_FILE");
const appBase = process.env.APP_BASE_URL ?? "http://127.0.0.1:3000";
const appOrigin = process.env.APP_ORIGIN ?? appBase;
const supabaseUrl = `https://${projectRef}.supabase.co`;
const runId = randomUUID().slice(0, 8);
const users: User[] = [];
const results: Result[] = [];
const realtimeClients: SupabaseClient[] = [];
const realtimeErrors = new WeakMap<RealtimeChannel, string>();
let pool: Pool | undefined;
let deferredDeletion = false;

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

async function createPublicSyntheticUser(label: string) {
  const password = `${randomBytes(30).toString("base64url")}aA1!`;
  const email = `fb-${runId}-${label}@example.invalid`;
  const signup = await jsonRequest(`${supabaseUrl}/auth/v1/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, data: { full_name: `Preview ${label.toUpperCase()}` } }),
  }, "publishable");
  const id = signup.body?.user?.id ?? signup.body?.id;
  check(`create_confirmed_synthetic_${label}`, signup.status === 200 && typeof id === "string" && typeof signup.body?.access_token === "string", signup.status);
  if (signup.status !== 200 || !id || !signup.body?.access_token) throw new Error(`public synthetic user ${label} signup failed`);
  const signin = await jsonRequest(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }, "publishable");
  check(`password_signin_${label}`, signin.status === 200 && typeof signin.body?.access_token === "string", signin.status);
  if (signin.status !== 200 || !signin.body?.access_token) throw new Error(`synthetic user ${label} sign-in failed`);
  users.push({ label, id, email, password, token: signin.body.access_token, deleted: false });
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
    if (user.deleted || publicSignup) continue;
    const response = await request(`${supabaseUrl}/auth/v1/admin/users/${user.id}`, { method: "DELETE" }, "admin").catch(() => null);
    check(`synthetic_auth_cleanup_${user.label}`, response?.status === 204 || response?.status === 404 || response?.status === 200, response?.status ?? "network_error");
  }
}

async function main() {
  if (!publicSignup) {
    const dsn = `postgresql://${encodeURIComponent(`freeborn_runtime.${projectRef}`)}:${encodeURIComponent(runtimePassword)}@${poolerHost}:6543/postgres?sslmode=require&pgbouncer=true`;
    const connection = resolveDatabaseConnection(dsn, { vercelEnv: "preview" });
    pool = new Pool({ connectionString: connection.connectionString, ssl: connection.ssl, max: 2, connectionTimeoutMillis: 8_000 });
  }
  console.log(`synthetic_run=${runId}`);
  try {
    for (const label of ["a", "b", "c"]) await (publicSignup ? createPublicSyntheticUser(label) : createSyntheticUser(label));
    const [a, b, c] = users;
    for (const user of users) {
      const response = await api(user, "/api/chat/matches");
      check(`member_bootstrap_${user.label}`, response.status === 200 && Array.isArray(response.body?.matches), response.status);
    }
    const account = await api(a, "/api/account");
    check("account_facts_and_auth_bridge", account.status === 200 && typeof account.body?.activeSignIns === "number" && typeof account.body?.createdAt === "string", account.status);
    const settings = await api(a, "/api/settings");
    check("member_settings_read", settings.status === 200 && typeof settings.body?.account?.email === "string", settings.status);

    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4S8AAAAASUVORK5CYII=", "base64");
    const photoData = `data:image/png;base64,${png.toString("base64")}`;
    const anonymousOnboarding = await api(null, "/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: "identity", patch: {} }) });
    check("anonymous_onboarding_denied", anonymousOnboarding.status === 401, anonymousOnboarding.status);
    const underage = await api(a, "/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: "identity", patch: { birth_date: "2012-01-01" } }) });
    check("underage_onboarding_denied", underage.status === 400, underage.status);
    const onboardingSteps = [
      ["identity", { display_name: "Preview A", birth_date: "1990-01-01", gender: "non_binary" }],
      ["location", { city: "Lagos", region: "Lagos", country_code: "NG", location_source: "manual" }],
      ["relationship_intent", { relationship_goals: ["long_term"], values: ["Honesty"] }],
      ["bio", { bio: "Synthetic Preview member profile for acceptance testing.", occupation: "Engineer", education: "Bachelor's degree" }],
      ["interests", { lifestyle_preferences: ["Homebody"], interests: ["Reading", "Cooking", "Art"] }],
      ["photos", { photos: [{ id: "pixel", src: photoData, isCover: true }] }],
    ] as const;
    for (const [step, patch] of onboardingSteps) {
      const saved = await api(a, "/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step, patch }) });
      check(`onboarding_${step}_saved`, saved.status === 200 && saved.body?.ok === true, saved.status);
    }
    const completedOnboarding = await api(a, "/api/onboarding/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    check("onboarding_completed", completedOnboarding.status === 200 && completedOnboarding.body?.ok === true, completedOnboarding.body?.error ?? completedOnboarding.status);
    const onboardingState = await api(a, "/api/onboarding/state");
    check("onboarding_state_readable", onboardingState.status === 200, onboardingState.status);
    const ownProfile = await api(a, "/api/profile/me");
    check("profile_and_onboarding_photo_readable", ownProfile.status === 200 && ownProfile.body?.profile?.displayName === "Preview A" && ownProfile.body?.profile?.photos?.length > 0, `${ownProfile.status}/${ownProfile.body?.profile?.displayName ?? "missing"}/${ownProfile.body?.profile?.photos?.length ?? 0}`);
    const invalidHeight = await api(a, "/api/profile/me", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ heightCmProfile: 4 }) });
    check("invalid_profile_height_denied", invalidHeight.status === 400, invalidHeight.status);
    const updatedProfile = await api(a, "/api/profile/me", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: "Preview A Updated", city: "Lagos" }) });
    check("profile_update_allowed", updatedProfile.status === 200, updatedProfile.status);
    const forgedVerification = await jsonRequest(`${supabaseUrl}/rest/v1/user_profiles?id=eq.${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ is_verified: true }) }, "user", a.token);
    const verificationAfterForgery = await jsonRequest(`${supabaseUrl}/rest/v1/user_profiles?id=eq.${a.id}&select=is_verified`, {}, "user", a.token);
    const persistedVerification = Array.isArray(verificationAfterForgery.body) ? verificationAfterForgery.body[0]?.is_verified : undefined;
    check("client_profile_verification_update_denied", (forgedVerification.status === 401 || forgedVerification.status === 403) && verificationAfterForgery.status === 200 && persistedVerification === false, `${forgedVerification.status}/${verificationAfterForgery.status}/${String(persistedVerification)}`);
    const profilePhoto = await api(a, "/api/profile/photos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: photoData }) });
    check("profile_photo_upload_allowed", profilePhoto.status === 200 && profilePhoto.body?.ok === true, profilePhoto.status);
    const invalidPhoto = await api(a, "/api/profile/photos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: "data:text/plain;base64,AA==" }) });
    check("profile_photo_mime_denied", invalidPhoto.status === 400, invalidPhoto.status);
    const directMatch = await jsonRequest(`${supabaseUrl}/rest/v1/matches`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_a: a.id, user_b: c.id, initiated_by: a.id }) }, "user", a.token);
    check("client_match_insert_denied", directMatch.status === 401 || directMatch.status === 403, directMatch.status);
    const directVerification = await jsonRequest(`${supabaseUrl}/rest/v1/verification_requests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account_id: a.id, status: "approved" }) }, "user", a.token);
    check("client_verification_insert_denied", directVerification.status === 401 || directVerification.status === 403, directVerification.status);
    const crossProfile = await jsonRequest(`${supabaseUrl}/rest/v1/user_profiles?id=eq.${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ display_name: "cross-account-write" }) }, "user", b.token);
    check("cross_account_profile_update_empty", crossProfile.status === 200 && Array.isArray(crossProfile.body) && crossProfile.body.length === 0, crossProfile.status);

    const [userA, userB] = [a.id, b.id].sort();
    if (publicSignup) {
      for (const [user, liked, label] of [[a, b.id, "a"], [b, a.id, "b"]] as const) {
        const swipe = await jsonRequest(`${supabaseUrl}/rest/v1/user_swipes`, { method: "POST", headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ liker_id: user.id, liked_id: liked, action: "like" }) }, "user", user.token);
        check(`mutual_like_${label}_recorded`, swipe.status === 200 || swipe.status === 201, swipe.status);
      }
    } else {
      await pool!.query(`insert into public.user_swipes(liker_id,liked_id,action) values($1,$2,'like'),($2,$1,'like') on conflict do nothing`, [userA, userB]);
    }
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

    const [dbB, dbC, dbAnon] = await Promise.all([realtime(b.token), realtime(c.token), realtime()]);
    type Notice = { kind?: string; at?: string } & Record<string, unknown>;
    let signalB: string | null = null, signalC: string | null = null;
    let noticeB: Notice | null = null, noticeC: Notice | null = null, noticeAnon: Notice | null = null;
    const chatTopic = `fb-chat:${matchId}`;
    const privateConfig = { private: true, broadcast: { self: false, ack: true } } as const;
    const validNotice = (notice: Notice | null) => Boolean(
      notice && notice.kind === "message" && typeof notice.at === "string" &&
      Object.keys(notice).sort().join(",") === "at,kind"
    );
    const dbChannelB = dbB.channel(chatTopic, { config: privateConfig })
      .on("broadcast", { event: "fb-message" }, (payload) => { noticeB = payload.payload as Notice; })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_signals", filter: `match_id=eq.${matchId}` }, (payload) => { signalB = String(payload.new?.match_id ?? "missing_match"); });
    const dbChannelC = dbC.channel(chatTopic, { config: privateConfig })
      .on("broadcast", { event: "fb-message" }, (payload) => { noticeC = payload.payload as Notice; })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_signals", filter: `match_id=eq.${matchId}` }, (payload) => { signalC = String(payload.new?.match_id ?? "missing_match"); });
    const dbChannelAnon = dbAnon.channel(chatTopic, { config: privateConfig })
      .on("broadcast", { event: "fb-message" }, (payload) => { noticeAnon = payload.payload as Notice; });
    const [dbStatusB, dbStatusC, dbStatusAnon] = await Promise.all([subscribe(dbChannelB), subscribe(dbChannelC), subscribe(dbChannelAnon)]);
    check("realtime_database_participant_subscription", dbStatusB === "SUBSCRIBED", `${dbStatusB}/${subscriptionError(dbChannelB)}`);
    check("nonparticipant_private_chat_denied", dbStatusC !== "SUBSCRIBED", `${dbStatusC}/${subscriptionError(dbChannelC)}`);
    check("anonymous_private_chat_denied", dbStatusAnon !== "SUBSCRIBED", `${dbStatusAnon}/${subscriptionError(dbChannelAnon)}`);

    const participantTopicRead = await jsonRequest(`${supabaseUrl}/rest/v1/rpc/can_use_chat_topic`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ p_topic: chatTopic, p_write: false }),
    }, "user", b.token);
    const participantTopicWrite = await jsonRequest(`${supabaseUrl}/rest/v1/rpc/can_use_chat_topic`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ p_topic: chatTopic, p_write: true }),
    }, "user", b.token);
    const nonparticipantTopic = await jsonRequest(`${supabaseUrl}/rest/v1/rpc/can_use_chat_topic`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ p_topic: chatTopic, p_write: true }),
    }, "user", c.token);
    const anonymousTopic = await jsonRequest(`${supabaseUrl}/rest/v1/rpc/can_use_chat_topic`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ p_topic: chatTopic, p_write: true }),
    }, "publishable");
    check("participant_private_chat_read_predicate", participantTopicRead.status === 200 && participantTopicRead.body === true, `${participantTopicRead.status}/${participantTopicRead.body}`);
    check("participant_private_chat_write_predicate", participantTopicWrite.status === 200 && participantTopicWrite.body === true, `${participantTopicWrite.status}/${participantTopicWrite.body}`);
    check("nonparticipant_private_chat_predicate", nonparticipantTopic.status === 200 && nonparticipantTopic.body === false, `${nonparticipantTopic.status}/${nonparticipantTopic.body}`);
    check("anonymous_private_chat_predicate", anonymousTopic.status === 401 || anonymousTopic.status === 403, `${anonymousTopic.status}/${anonymousTopic.body}`);

    const storedSignals = await jsonRequest(`${supabaseUrl}/rest/v1/chat_signals?select=id,match_id&match_id=eq.${matchId}`, {}, publicSignup ? "user" : "admin", publicSignup ? b.token : undefined);
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

    let sentRounds = 0, databaseRounds = 0, broadcastRounds = 0;
    for (let round = 1; round <= 5; round += 1) {
      signalB = null; noticeB = null;
      const sentRound = await api(a, "/api/chat/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ match: matchId, text: `signal-${runId}-${round}` }) });
      if (sentRound.status === 200) sentRounds += 1;
      const gotDatabase = await waitFor(() => signalB !== null, 12_000);
      const gotBroadcast = await waitFor(() => validNotice(noticeB), 8_000);
      if (gotDatabase && signalB === matchId) databaseRounds += 1;
      if (gotBroadcast) broadcastRounds += 1;
    }
    check("realtime_message_rounds_send_5_of_5", sentRounds === 5, `${sentRounds}/5`);
    check("participant_database_signal_received_5_of_5", databaseRounds === 5, `${databaseRounds}/5`);
    check("participant_private_server_broadcast_received_5_of_5", broadcastRounds === 5, `${broadcastRounds}/5`);
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    check("nonparticipant_database_signal_not_received", signalC === null, signalC ?? "none");
    check("nonparticipant_private_broadcast_not_received", noticeC === null, noticeC ? "received" : "none");
    check("anonymous_private_broadcast_not_received", noticeAnon === null, noticeAnon ? "received" : "none");
    await removeChannel(dbB, dbChannelB); await removeChannel(dbC, dbChannelC); await removeChannel(dbAnon, dbChannelAnon);

    /* ---------- 30. signed-in trust, privacy, lifecycle and report surfaces ----------
       These close the crosswalk gaps the hosted suite never exercised: REA-TRUST
       (/api/trust/self), ARC2-PRIVACY + RES-INCOGNITO-RLS (snooze, incognito, hide
       distance, active status, read receipts, blocked manager), REA-VERIFICATION-FILTER
       (verified-only discovery), REA-SCAM (a filed scam report) and RES-UNMATCH-LIVE
       (two-account unmatch, then the documented read/send/report behaviour afterwards).

       Every exclusion check below is anchored to a POSITIVE baseline first: the member
       must be visible in the deck before the privacy control is turned on, otherwise an
       empty deck would make "excluded" pass for the wrong reason. */
    const onboardForDiscovery = async (user: User, name: string) => {
      const steps: Array<[string, Record<string, unknown>]> = [
        ["identity", { display_name: name, birth_date: "1992-02-02", gender: "non_binary" }],
        ["location", { city: "Lagos", region: "Lagos", country_code: "NG", location_source: "manual" }],
        ["relationship_intent", { relationship_goals: ["long_term"], values: ["Honesty"] }],
        ["bio", { bio: "Synthetic Preview member profile for acceptance testing.", occupation: "Engineer", education: "Bachelor's degree" }],
        ["interests", { lifestyle_preferences: ["Homebody"], interests: ["Reading", "Cooking", "Art"] }],
        ["photos", { photos: [{ id: "pixel", src: photoData, isCover: true }] }],
      ];
      for (const [step, patch] of steps) {
        await api(user, "/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step, patch }) });
      }
      const done = await api(user, "/api/onboarding/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      return done.status === 200 && done.body?.ok === true;
    };
    const deckIds = async (viewer: User, query = "") => {
      const deck = await api(viewer, `/api/profiles${query}`);
      const list = Array.isArray(deck.body?.profiles) ? (deck.body.profiles as Array<Record<string, unknown>>) : [];
      return { status: deck.status, ids: list.map((row) => String(row.id)), rows: list, facets: deck.body?.facets };
    };
    /* The deck is a ranked feed: src/app/api/profiles/route.ts scores every candidate with
       a `Math.random() * 4` jitter and then applies the viewer's own filters in a second
       pass, so a single response is a sample, not a membership oracle. A POSITIVE
       expectation therefore reads the deck up to `tries` times and accepts a hit in any of
       them. A NEGATIVE expectation (a privacy control must exclude somebody) still uses a
       single read: retrying could only make an exclusion check weaker, never stronger. */
    const deckContains = async (viewer: User, targetId: string, tries = 4) => {
      const seen: string[] = [];
      for (let attempt = 0; attempt < tries; attempt += 1) {
        const deck = await deckIds(viewer);
        seen.push(...deck.ids);
        if (deck.ids.includes(targetId)) return { hit: true, attempts: attempt + 1, seen: [...new Set(seen)] };
      }
      return { hit: false, attempts: tries, seen: [...new Set(seen)] };
    };

    check("onboarding_completed_for_second_member", await onboardForDiscovery(b, "Preview B"), b.id);

    const trustSelf = await api(a, "/api/trust/self");
    check(
      "trust_self_signed_in_http_verification",
      trustSelf.status === 200 && typeof trustSelf.body?.score === "number" && typeof trustSelf.body?.band === "string",
      `${trustSelf.status}/${typeof trustSelf.body?.score}`,
    );
    const trustAnonymous = await api(null, "/api/trust/self");
    check("trust_self_anonymous_denied", trustAnonymous.status === 401, trustAnonymous.status);

    const baselineB = await deckContains(c, b.id);
    const baselineHasB = baselineB.hit;
    check(
      "discovery_deck_baseline_contains_second_member",
      baselineHasB,
      `attempts=${baselineB.attempts}/seen=${baselineB.seen.length}`,
    );
    const baselineA = await deckContains(c, a.id);
    const baselineHasA = baselineA.hit;
    check(
      "discovery_deck_baseline_contains_first_member",
      baselineHasA,
      `attempts=${baselineA.attempts}/seen=${baselineA.seen.length}`,
    );

    const verifiedDeck = await deckIds(c, "?verified=1");
    check(
      "verified_only_filter_excludes_the_unverified_member",
      verifiedDeck.status === 200 && baselineHasB && !verifiedDeck.ids.includes(b.id) && verifiedDeck.rows.every((row) => row.verified === true),
      `${verifiedDeck.status}/baseline=${baselineHasB}/verified_deck=${verifiedDeck.ids.length}`,
    );

    const privacyWrite = await api(a, "/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ privacy: { discoveryPaused: false, hideDistance: true, hideActiveStatus: true, readReceipts: false } }),
    });
    check("privacy_matrix_write_accepted", privacyWrite.status === 200 && privacyWrite.body?.ok === true, privacyWrite.status);
    const privacyRead = await api(a, "/api/settings");
    const privacyBody = (privacyRead.body?.privacy ?? {}) as Record<string, unknown>;
    check(
      "privacy_matrix_roundtrip_display_and_receipt_controls",
      privacyRead.status === 200
        && privacyBody.hideDistance === true
        && privacyBody.hideActiveStatus === true
        && privacyBody.readReceipts === false
        && privacyBody.discoveryPaused === false,
      JSON.stringify(privacyBody),
    );
    /* A ONE-WAY like from C to A. It cannot be used to observe the incognito admirer
       carve-out, because the same swipe puts A into C's `hiddenIds` under the
       "no silent recycling" rule — which is exactly why that carve-out is unreachable in
       the deck (see the audit note in src/app/api/profiles/route.ts). It is asserted here
       for the rule that IS observable, and incognito exclusion is then measured from B,
       who has no like or match relationship with A. */
    const admirerLike = await jsonRequest(`${supabaseUrl}/rest/v1/user_swipes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ liker_id: c.id, liked_id: a.id, action: "like" }),
    }, "user", c.token);
    check("one_way_admirer_like_recorded", admirerLike.status === 200 || admirerLike.status === 201, admirerLike.status);
    /* "No silent recycling" (src/app/api/profiles/route.ts): every profile the viewer has
       already swiped leaves their deck. This is asserted because it is the reason the
       incognito admirer exception in the same file is unreachable — see the note there.
       The positive half is retried for the ranking jitter; the exclusion half is not. */
    check(
      "member_visible_in_an_unrelated_deck_before_any_like",
      baselineHasA,
      `attempts=${baselineA.attempts}/seen=${baselineA.seen.length}`,
    );
    const afterLike = await deckIds(c);
    check(
      "swiped_member_leaves_the_likers_deck_no_silent_recycling",
      afterLike.status === 200 && baselineHasA && !afterLike.ids.includes(a.id),
      `before=${baselineHasA}/after=${afterLike.ids.includes(a.id)}/deck=${afterLike.ids.length}`,
    );
    await api(a, "/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ privacy: { incognito: true } }),
    });
    const incognitoDeckForB = await deckIds(b);
    check(
      "incognito_member_excluded_from_a_deck_with_no_like_relationship",
      incognitoDeckForB.status === 200 && !incognitoDeckForB.ids.includes(a.id),
      `${incognitoDeckForB.status}/${incognitoDeckForB.ids.length}`,
    );
    await api(a, "/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ privacy: { incognito: false, hideDistance: false, hideActiveStatus: false, readReceipts: true } }),
    });

    await api(b, "/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ privacy: { discoveryPaused: true } }),
    });
    const snoozeDeck = await deckIds(c);
    check(
      "snoozed_member_excluded_from_discovery_deck",
      snoozeDeck.status === 200 && baselineHasB && !snoozeDeck.ids.includes(b.id),
      `baseline=${baselineHasB}/after=${snoozeDeck.ids.includes(b.id)}`,
    );
    await api(b, "/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ privacy: { discoveryPaused: false } }),
    });
    const unsnoozed = await deckContains(c, b.id);
    check(
      "unsnoozed_member_returns_to_discovery_deck",
      baselineHasB && unsnoozed.hit,
      `attempts=${unsnoozed.attempts}/seen=${unsnoozed.seen.length}`,
    );

    const blockB = await api(c, "/api/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: b.id, reason: "synthetic" }),
    });
    check("block_write_accepted", blockB.status === 200 && blockB.body?.ok === true, blockB.status);
    const blockDeck = await deckIds(c);
    check(
      "blocked_member_excluded_from_discovery_deck",
      blockDeck.status === 200 && baselineHasB && !blockDeck.ids.includes(b.id),
      `baseline=${baselineHasB}/after=${blockDeck.ids.includes(b.id)}`,
    );
    const blockList = await api(c, "/api/blocks");
    check(
      "blocked_manager_lists_the_blocked_member",
      blockList.status === 200
        && Array.isArray(blockList.body?.blocked)
        && (blockList.body.blocked as Array<Record<string, unknown>>).some((row) => row.id === b.id),
      blockList.status,
    );
    const unblock = await api(c, "/api/blocks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: b.id }),
    });
    check("unblock_accepted", unblock.status === 200 && unblock.body?.ok === true, unblock.status);
    const blockListAfter = await api(c, "/api/blocks");
    check(
      "blocked_manager_no_longer_lists_the_unblocked_member",
      blockListAfter.status === 200
        && Array.isArray(blockListAfter.body?.blocked)
        && !(blockListAfter.body.blocked as Array<Record<string, unknown>>).some((row) => row.id === b.id),
      blockListAfter.status,
    );

    const unmatchUnconfirmed = await api(a, "/api/chat/unmatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ with: b.id }),
    });
    check(
      "unmatch_requires_explicit_confirmation",
      unmatchUnconfirmed.status === 409 && unmatchUnconfirmed.body?.needsConfirmation === true,
      unmatchUnconfirmed.status,
    );
    const unmatchBadReason = await api(a, "/api/chat/unmatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ with: b.id, reason: "not_one_of_ours", destructive: true }),
    });
    check("unmatch_unknown_reason_denied", unmatchBadReason.status === 400, unmatchBadReason.status);
    const unmatched = await api(a, "/api/chat/unmatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ with: b.id, reason: "not_interested", destructive: true }),
    });
    check(
      "unmatch_confirmed_succeeds_for_both_accounts",
      unmatched.status === 200 && unmatched.body?.unmatched === true,
      unmatched.status,
    );
    /* Documented contract in src/app/api/chat/messages/route.ts: the member who was
       unmatched keeps read access so they can still quote and report what was sent to
       them; the member who ended it loses their own copy. Neither may send. */
    const readByUnmatchedMember = await api(b, `/api/chat/messages?match=${matchId}`);
    check(
      "unmatched_member_keeps_read_access_to_quote_and_report",
      readByUnmatchedMember.status === 200 && Array.isArray(readByUnmatchedMember.body?.messages),
      readByUnmatchedMember.status,
    );
    const readByActor = await api(a, `/api/chat/messages?match=${matchId}`);
    check(
      "member_who_unmatched_loses_read_access_to_their_own_copy",
      readByActor.status === 403 && readByActor.body?.ended === true,
      readByActor.status,
    );
    const sendAfterUnmatch = await api(b, "/api/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match: matchId, text: `after-unmatch-${runId}` }),
    });
    check("unmatched_conversation_refuses_new_messages", sendAfterUnmatch.status === 403 || sendAfterUnmatch.status === 404, sendAfterUnmatch.status);
    const reportAfterUnmatch = await api(b, "/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: a.id, reason: "harassment", details: `synthetic-${runId}` }),
    });
    check(
      "report_path_still_available_after_unmatch",
      reportAfterUnmatch.status === 200 && reportAfterUnmatch.body?.ok === true,
      reportAfterUnmatch.status,
    );

    const scamReport = await api(c, "/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: b.id, reason: "scam", details: `synthetic scam report ${runId}` }),
    });
    check(
      "scam_report_filed_and_triaged_over_http",
      scamReport.status === 200 && scamReport.body?.ok === true && typeof scamReport.body?.triage === "string",
      `${scamReport.status}/triage=${scamReport.body?.triage ?? "none"}/outcome=${scamReport.body?.outcome ?? "none"}`,
    );
    const selfReport = await api(c, "/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: c.id, reason: "scam" }),
    });
    check("self_report_denied", selfReport.status === 400, selfReport.status);

    for (const user of users) {
      const deleted = await api(user, "/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete" }) });
      const accepted = deleted.status === 202 && deleted.body?.completed === false && typeof deleted.body?.deletionToken === "string";
      check(`account_deletion_accepted_${user.label}`, accepted, deleted.status);
      if (accepted) { user.deleted = true; user.deletionToken = deleted.body.deletionToken; }
    }
    if (users.every((user) => user.deleted)) {
      if (publicSignup) {
        writeFileSync(deletionStateFile!, JSON.stringify({ runId, projectRef, users, results }), { mode: 0o600 });
        deferredDeletion = true;
        return;
      }
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
    if (deferredDeletion) {
      console.log(JSON.stringify({ status: "awaiting_queue_drain", runId, syntheticUserIds: users.map((user) => user.id), passed: results.filter((result) => result.pass).length, failed: results.filter((result) => !result.pass).length }, null, 2));
      if (results.some((result) => !result.pass)) process.exitCode = 1;
      return;
    }
    const failed = results.filter((result) => !result.pass);
    console.log(JSON.stringify({ status: failed.length ? "fail" : "pass", passed: results.length - failed.length, failed: failed.length, results }, null, 2));
    if (failed.length) process.exitCode = 1;
  })
  .catch((error) => {
    console.log(JSON.stringify({ status: "harness_error", error: error instanceof Error ? error.message.slice(0, 160) : "unknown", results }, null, 2));
    process.exitCode = 1;
  });
