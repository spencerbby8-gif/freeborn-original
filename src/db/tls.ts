import type { ConnectionOptions } from "node:tls";

const DRIVER_TLS_PARAMS = [
  "ssl",
  "sslmode",
  "sslcert",
  "sslkey",
  "sslrootcert",
  "sslnegotiation",
] as const;

export type ResolvedDatabaseConnection = {
  connectionString: string;
  ssl?: ConnectionOptions;
};

function isLocalHost(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

function isSupabaseHost(hostname: string): boolean {
  return hostname.endsWith(".supabase.com") || hostname.endsWith(".supabase.co");
}

/**
 * node-postgres parses the DSN *after* receiving the Pool options. A DSN with
 * sslmode/sslrootcert therefore replaces the explicit `ssl` object, and pg 8
 * maps `sslmode=require` to Node's default full verification. Supabase's
 * private CA is not in Node's public trust store, so that combination fails
 * with SELF_SIGNED_CERT_IN_CHAIN before authentication.
 *
 * Remove every driver-level TLS key and return one unambiguous TLS policy.
 * Verification uses the project CA downloaded from Supabase Database Settings.
 * Every Supabase environment fails closed until DATABASE_CA_CERT is present.
 * No environment is allowed to silently downgrade to unverified TLS, and no
 * global TLS bypass is used.
 */
export function resolveDatabaseConnection(
  databaseUrl: string,
  options: { caCertificate?: string; vercelEnv?: string } = {},
): ResolvedDatabaseConnection {
  const url = new URL(databaseUrl);
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("Database URL must use postgres:// or postgresql://.");
  }
  for (const key of DRIVER_TLS_PARAMS) url.searchParams.delete(key);

  if (isLocalHost(url.hostname)) {
    return { connectionString: url.toString(), ssl: undefined };
  }

  const caCertificate = options.caCertificate?.trim();
  if (options.vercelEnv === "production" && !caCertificate) {
    throw new Error(
      "DATABASE_CA_CERT is required in Vercel production. Download the CA from Supabase Database Settings; refusing unverified production TLS.",
    );
  }

  if (caCertificate) {
    const ca = caCertificate.replace(/\\n/g, "\n");
    if (!ca.includes("-----BEGIN CERTIFICATE-----") || !ca.includes("-----END CERTIFICATE-----")) {
      throw new Error("DATABASE_CA_CERT must be a PEM certificate, not a file path or opaque value.");
    }
    return {
      connectionString: url.toString(),
      ssl: { ca, rejectUnauthorized: true },
    };
  }

  if (isSupabaseHost(url.hostname)) {
    throw new Error(
      "DATABASE_CA_CERT is required for Supabase in every environment; refusing unverified TLS.",
    );
  }

  // Other managed Postgres providers normally use a public CA. Keep Node's
  // certificate and hostname verification enabled rather than weakening it.
  return { connectionString: url.toString(), ssl: { rejectUnauthorized: true } };
}
