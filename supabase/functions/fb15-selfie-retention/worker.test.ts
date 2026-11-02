// FB-15 worker unit tests (Deno). Run: npm run test:retention-worker
// Uses a fake Supabase client: no network, no real Storage, no real project.
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { failJob, ownedPath, processJob, type RetentionJob } from "./worker.ts";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const OBJ = "33333333-3333-4333-8333-333333333333";
const NEWER = "44444444-4444-4444-8444-444444444444";
const LEASE = "55555555-5555-4555-8555-555555555555";

type Handlers = {
  rpc?: Record<string, (args: Record<string, unknown>) => { data: unknown; error: unknown }>;
  list?: { data: { name: string; id: string | null }[] | null; error: unknown }[] | (() => { data: unknown; error: unknown });
  remove?: () => { error: unknown };
};

function fakeAdmin(h: Handlers = {}) {
  const calls: { name: string; args: unknown }[] = [];
  let listIndex = 0;
  const rpcDefaults: Record<string, (args: Record<string, unknown>) => { data: unknown; error: unknown }> = {
    fb15_owned_selfie_path: () => ({ data: true, error: null }),
    fb15_authorize_storage_purge: () => ({ data: { storagePath: `${ACCOUNT}/a.jpg`, storageObjectId: OBJ }, error: null }),
    fb15_complete_retention_job: () => ({ data: "completed", error: null }),
    fb15_purge_inline: () => ({ data: true, error: null }),
    fb15_fail_retention_job: () => ({ data: true, error: null }),
  };
  const admin = {
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      const handler = h.rpc?.[name] ?? rpcDefaults[name];
      return Promise.resolve(handler ? handler(args) : { data: null, error: null });
    },
    storage: {
      from: () => ({
        list: () => {
          calls.push({ name: "list", args: null });
          if (typeof h.list === "function") return Promise.resolve(h.list());
          const step = h.list?.[Math.min(listIndex, (h.list?.length ?? 1) - 1)];
          listIndex += 1;
          return Promise.resolve(step ?? { data: [], error: null });
        },
        remove: (paths: string[]) => {
          calls.push({ name: "remove", args: paths });
          return Promise.resolve(h.remove ? h.remove() : { error: null });
        },
      }),
    },
  } as unknown as SupabaseClient;
  return { admin, calls, removed: () => calls.filter((c) => c.name === "remove").length };
}

function storageJob(over: Partial<RetentionJob> = {}): RetentionJob {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    asset_key: "check:77777777-7777-4777-8777-777777777777",
    account_id: ACCOUNT,
    source_table: "verification_selfie_checks",
    source_id: "77777777-7777-4777-8777-777777777777",
    storage_path: `${ACCOUNT}/a.jpg`,
    storage_object_id: OBJ,
    has_inline: false,
    reason: "rejected",
    attempts: 1,
    lease_token: LEASE,
    ...over,
  };
}

function inlineJob(over: Partial<RetentionJob> = {}): RetentionJob {
  return {
    ...storageJob(),
    asset_key: "request:88888888-8888-4888-8888-888888888888",
    source_table: "verification_requests",
    source_id: "88888888-8888-4888-8888-888888888888",
    storage_path: null,
    storage_object_id: null,
    has_inline: true,
    reason: "rejected",
    ...over,
  };
}

Deno.test("path ownership accepts only the account's own paths", () => {
  assertEquals(ownedPath(ACCOUNT, `${ACCOUNT}/a.jpg`), true);
  assertEquals(ownedPath(ACCOUNT, `selfie-${ACCOUNT}-1700000000.jpg`), true);
  assertEquals(ownedPath(ACCOUNT, `${OTHER}/a.jpg`), false);
  assertEquals(ownedPath(ACCOUNT, `${ACCOUNT}/../${OTHER}/a.jpg`), false);
  assertEquals(ownedPath(ACCOUNT, `${ACCOUNT}\\x.jpg`), false);
  assertEquals(ownedPath(ACCOUNT, `https://example.test/${ACCOUNT}/a.jpg`), false);
  assertEquals(ownedPath(ACCOUNT, `/${ACCOUNT}/a.jpg`), false);
  assertEquals(ownedPath("not-a-uuid", `${ACCOUNT}/a.jpg`), false);
  assertEquals(ownedPath(ACCOUNT, ""), false);
});

Deno.test("inline job: purge then complete returns completed", async () => {
  const { admin, calls } = fakeAdmin();
  assertEquals(await processJob(admin, inlineJob()), "completed");
  assertEquals(calls.map((c) => c.name), ["fb15_purge_inline", "fb15_complete_retention_job"]);
});

Deno.test("inline job held at purge time is failed (recorded), not silently dropped", async () => {
  const { admin } = fakeAdmin({ rpc: { fb15_purge_inline: () => ({ data: false, error: null }) } });
  await assertRejects(() => processJob(admin, inlineJob()), Error, "hold_changed");
});

Deno.test("inline completion that still sees bytes is a retryable failure", async () => {
  const { admin } = fakeAdmin({ rpc: { fb15_complete_retention_job: () => ({ data: "verification_failed", error: null }) } });
  await assertRejects(() => processJob(admin, inlineJob()), Error, "inline_purge_failed");
});

Deno.test("storage job: successful remove verifies absence and completes", async () => {
  const { admin, calls, removed } = fakeAdmin({
    list: [
      { data: [{ name: "a.jpg", id: OBJ }], error: null }, // before remove: target present
      { data: [], error: null }, // after remove: absent
    ],
  });
  assertEquals(await processJob(admin, storageJob()), "completed");
  assertEquals(removed(), 1);
  const removeCall = calls.find((c) => c.name === "remove");
  assertEquals(removeCall?.args, [`${ACCOUNT}/a.jpg`]);
});

Deno.test("storage job: a list failure never attempts removal", async () => {
  const { admin, removed } = fakeAdmin({ list: [{ data: null, error: new Error("boom") }] });
  await assertRejects(() => processJob(admin, storageJob()), Error, "storage_list_failed");
  assertEquals(removed(), 0);
});

Deno.test("storage job: remove failure is retryable with a fixed code", async () => {
  const { admin } = fakeAdmin({
    list: [{ data: [{ name: "a.jpg", id: OBJ }], error: null }],
    remove: () => ({ error: new Error("provider text must not leak") }),
  });
  await assertRejects(() => processJob(admin, storageJob()), Error, "storage_remove_failed");
});

Deno.test("storage job: object still present after remove is a verify failure", async () => {
  const { admin } = fakeAdmin({
    list: [{ data: [{ name: "a.jpg", id: OBJ }], error: null }],
  });
  await assertRejects(() => processJob(admin, storageJob()), Error, "storage_verify_failed");
});

Deno.test("reused path: a NEWER object at the same path is never deleted", async () => {
  const { admin, removed } = fakeAdmin({
    list: [{ data: [{ name: "a.jpg", id: NEWER }], error: null }],
  });
  assertEquals(await processJob(admin, storageJob()), "completed");
  assertEquals(removed(), 0);
});

Deno.test("completion refusal when the object is still present is a verify failure", async () => {
  const { admin } = fakeAdmin({
    list: [{ data: [], error: null }],
    rpc: { fb15_complete_retention_job: () => ({ data: "verification_failed", error: null }) },
  });
  await assertRejects(() => processJob(admin, storageJob()), Error, "storage_verify_failed");
});

Deno.test("hold appearing at completion is skipped (job already moved to held)", async () => {
  const { admin } = fakeAdmin({
    list: [{ data: [], error: null }],
    rpc: { fb15_complete_retention_job: () => ({ data: "hold_protected", error: null }) },
  });
  assertEquals(await processJob(admin, storageJob()), "skipped");
});

Deno.test("authorization refused (hold or stale lease) fails the job so it is recorded", async () => {
  const { admin, removed } = fakeAdmin({ rpc: { fb15_authorize_storage_purge: () => ({ data: null, error: null }) } });
  await assertRejects(() => processJob(admin, storageJob()), Error, "hold_changed");
  assertEquals(removed(), 0);
});

Deno.test("unowned storage path is refused before any Storage call", async () => {
  const { admin, calls } = fakeAdmin();
  await assertRejects(() => processJob(admin, storageJob({ storage_path: `${OTHER}/a.jpg` })), Error, "path_invalid");
  assertEquals(calls.some((c) => c.name === "list" || c.name === "remove"), false);
});

Deno.test("unknown failure codes are normalised to internal_error and carry no detail", async () => {
  let sent: unknown = null;
  const { admin } = fakeAdmin({
    rpc: { fb15_fail_retention_job: (args) => { sent = args; return { data: true, error: null }; } },
  });
  await failJob(admin, storageJob(), "raw provider error with a path");
  assertEquals((sent as { p_error_code: string }).p_error_code, "internal_error");
});

Deno.test("known failure codes are passed through", async () => {
  let sent: unknown = null;
  const { admin } = fakeAdmin({
    rpc: { fb15_fail_retention_job: (args) => { sent = args; return { data: true, error: null }; } },
  });
  await failJob(admin, storageJob(), "storage_remove_failed");
  assertEquals((sent as { p_error_code: string }).p_error_code, "storage_remove_failed");
});
