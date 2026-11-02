// FB-15 verification-selfie retention worker: HTTP entrypoint (Supabase Edge Function).
//
// Uses the platform-injected server credential; no service-role/secret key is read
// by Vercel, returned to a browser, logged, or stored in the repository. The caller
// must present the shared cron secret (verified inside Postgres from Vault).

import { createClient } from "npm:@supabase/supabase-js@2";
import { failJob, processJob, serverCredential, type RetentionJob } from "./worker.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const url = Deno.env.get("SUPABASE_URL");
  const key = serverCredential();
  if (!url || !key) return new Response("Server credential unavailable", { status: 500 });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const secret = req.headers.get("x-fb15-cron-secret") ?? "";
  if (secret.length < 32) return new Response("Unauthorized", { status: 401 });
  const { data: authorized, error: authError } = await admin.rpc("fb15_verify_cron_secret", { p_secret: secret });
  if (authError || authorized !== true) return new Response("Unauthorized", { status: 401 });

  const { error: scanError } = await admin.rpc("fb15_scan_retention", { p_limit: 100 });
  if (scanError) return new Response("Scan failed", { status: 500 });
  const { data, error } = await admin.rpc("fb15_claim_retention_jobs", { p_limit: 10 });
  if (error) return new Response("Claim failed", { status: 500 });
  const jobs = (data ?? []) as RetentionJob[];

  let completed = 0;
  let failed = 0;
  let skipped = 0;
  for (const job of jobs) {
    try {
      const outcome = await processJob(admin, job);
      if (outcome === "completed") completed += 1;
      else skipped += 1;
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : "internal_error";
      await failJob(admin, job, message);
    }
  }

  return Response.json({ claimed: jobs.length, completed, failed, skipped });
});
