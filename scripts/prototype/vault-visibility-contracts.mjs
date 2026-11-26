// Mutual-Filter Vault visibility contracts — production route/lib logic with
// deterministic auth/DB adapters, in the exact style of
// scripts/prototype/discovery-privacy-contracts.mjs. NO hosted RLS acceptance
// here: transactional writes are covered by test:vault-deletion-local and the
// clean-replay verifier; these contracts pin the SERVING behavior that must
// never leak: mutual visibility, the always-present `vault` key, and the
// bidirectional consent freeze (invariant V-2).
import assert from 'node:assert/strict';
import { build } from 'esbuild';

/* Test-only secrets (deterministic buffers — never real values). Set BEFORE
   the modules are bundled/imported so the lazy resolvers see a configured
   development runtime. The same buffers build the fixture payloads, so the
   decrypt key below is identical to the encrypt key used in the queues. */
const KEY = (label) => Buffer.alloc(32, label.charCodeAt(0));
process.env.VAULT_ENCRYPTION_KEY = KEY('k').toString('base64');
process.env.VAULT_MATCH_PEPPER = KEY('p').toString('base64');

const VIEWER = '11111111-1111-4111-8111-111111111111';
const TARGET = '22222222-2222-4222-8222-222222222222';

const S = { user: { id: VIEWER }, memberError: false, queue: [], mutations: 0, reads: 0 };

const mocks = {
  '@/lib/app-auth': 'export async function getMember(){if(globalThis.__vault.memberError)throw Error("auth outage");return globalThis.__vault.user}',
  '@/db': `
    function chain(){const h={from(){return h},where(){return h},orderBy(){return h},limit(){return h},groupBy(){return h},values(){return h},set(){return h},update(){return h},insert(){return h},delete(){return h},onConflictDoUpdate(){return h},onConflictDoNothing(){return h},then(ok,bad){++globalThis.__vault.reads;const v=globalThis.__vault.queue.shift();if(v===undefined)return Promise.reject(new Error('Unexpected DB read (queue empty)'));return Promise.resolve(v).then(ok,bad)}};return h}
    export const db={
      select(){return chain()},
      insert(){++globalThis.__vault.mutations;return chain()},
      update(){++globalThis.__vault.mutations;return chain()},
      delete(){++globalThis.__vault.mutations;return chain()},
      transaction(cb){++globalThis.__vault.mutations;return cb(chain())},
    };`,
};

const built = await build({
  stdin: {
    contents: `export * as detail from './src/app/api/profile/[id]/route';
export * as vaultRoutes from './src/app/api/vault/route';
export * as consentRoutes from './src/app/api/vault/consent/route';
export * as visibility from './src/lib/vault-visibility';
export * as vaultCrypto from './src/lib/vault-crypto';
export * as vaultSchema from './src/lib/vault-schema';`,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  plugins: [
    {
      name: 'fixture',
      setup(b) {
        b.onResolve({ filter: /^@\/(?:db|lib\/app-auth)$/ }, (a) => ({ path: a.path, namespace: 'fixture' }));
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, (a) => ({ contents: mocks[a.path], loader: 'js' }));
      },
    },
  ],
});
const { detail, vaultRoutes, consentRoutes, visibility, vaultCrypto, vaultSchema } = await import(
  'data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64')
);
globalThis.__vault = S;

const DIGEST = (value) => vaultCrypto.digestWithPepper(KEY('p'), 'vaccination_stance', value);
const ENVELOPE = (entries) => vaultCrypto.encryptWithKey(KEY('k'), entries);
const CURRENT = vaultSchema.CONSENT_VERSION;

const vaultRow = (version, entries) => ({ consentVersion: version, payload: ENVELOPE(entries) });
const digestRows = ({ viewer, target }) =>
  [
    ...viewer.map((value) => ({ userId: VIEWER, prefKey: 'vaccination_stance', valueDigest: DIGEST(value) })),
    ...target.map((value) => ({ userId: TARGET, prefKey: 'vaccination_stance', valueDigest: DIGEST(value) })),
  ];

const targetProfile = {
  id: TARGET, displayName: 'Bea', firstName: 'Bea', birthDate: '1998-01-02', createdAt: new Date(),
  lastActiveAt: new Date(), gender: 'woman', occupation: 'Teacher', education: '', educationLevel: "Bachelor's degree",
  religion: 'Christian', language: 'English', city: 'City', region: '', bio: 'A profile',
  vaccinationStatus: 'vaccinated', isVerified: false, values: ['Kindness'], interests: ['Hiking'],
  lifestylePreferences: ['Active lifestyle'], relationshipGoals: ['long_term'], maritalStatus: 'Never married',
  hasKids: 'No kids', wantsKids: 'Want kids', drinking: 'Socially', smoking: 'Never', promptAnswers: [],
  dealBreakers: [], heightCmProfile: null, heightCm: null, messagePrivacy: null,
  profileStatus: 'active', discoverable: true, onboardingStage: 'ready',
};

/** Queue the exact read sequence of the full profile/[id] GET for a non-self viewer. */
function queueProfileRead({ targetVault, viewerVault, digests }) {
  S.queue = [
    [targetProfile],                                                     // target profile row
    [{ latitude: 0, longitude: 0 }],                                     // viewer saved origin (before privacy branch)
    [{ incognito: false, discoveryPaused: false }],                      // owner privacy (active+discoverable+ready)
    [],                                                                  // blockedUsers check
    [],                                                                  // target photos
    [],                                                                  // target private location
    [],                                                                  // match ids of target
    [],                                                                  // incoming threads
    [],                                                                  // outgoing threads
    [{ count: 0 }],                                                      // likes received
    [{ count: 0 }],                                                      // match count
    [{ hideDistance: false, hideActiveStatus: false }],                  // owner privacy display flags
    [],                                                                  // mixer city
    [{ values: [], interests: [], lifestyle: [] }],                      // viewer values for inCommon
    targetVault, viewerVault, digests,                                   // getMutualVault (3 reads)
  ];
}

async function getProfile() {
  const res = await detail.GET(
    new Request(`http://local.test/api/profile/${TARGET}`),
    { params: Promise.resolve({ id: TARGET }) }
  );
  return { status: res.status, body: await res.json() };
}

let n = 0;
async function check(name, fn) {
  S.mutations = 0; S.reads = 0; S.user = { id: VIEWER }; S.memberError = false;
  await fn();
  console.log('ok ' + ++n + ' - ' + name);
}

/* ---------- invariant: the `vault` key is ALWAYS present ---------- */

await check('Mutual match reveals ONLY the matched key, and vault is present', async () => {
  queueProfileRead({
    targetVault: [vaultRow(CURRENT, { vaccination_stance: 'vaccinated', family_plans: 'open' })],
    viewerVault: [vaultRow(CURRENT, { vaccination_stance: 'vaccinated' })],
    digests: digestRows({ viewer: ['vaccinated'], target: ['vaccinated'] }),
  });
  const { status, body } = await getProfile();
  assert.equal(status, 200);
  assert.equal('vault' in body.profile, true);
  assert.deepEqual(body.profile.vault, { consentVersion: CURRENT, entries: { vaccination_stance: 'vaccinated' } });
  assert.equal(body.profile.vault.entries.family_plans, undefined, 'unmatched keys must never surface');
});

await check('Non-matching digests receive vault: null (key still present)', async () => {
  queueProfileRead({
    targetVault: [vaultRow(CURRENT, { vaccination_stance: 'unvaccinated' })],
    viewerVault: [vaultRow(CURRENT, { vaccination_stance: 'vaccinated' })],
    digests: digestRows({ viewer: ['vaccinated'], target: ['unvaccinated'] }),
  });
  const { body } = await getProfile();
  assert.equal(body.profile.vault, null);
});

await check('No digest rows at all receive vault: null (unset can never match)', async () => {
  queueProfileRead({
    targetVault: [vaultRow(CURRENT, { vaccination_stance: 'vaccinated' })],
    viewerVault: [vaultRow(CURRENT, { vaccination_stance: 'vaccinated' })],
    digests: [],
  });
  const { body } = await getProfile();
  assert.equal(body.profile.vault, null);
});

await check('Self-read returns vault: null and issues ZERO vault reads', async () => {
  S.user = { id: TARGET };
  const NON_VAULT_SELF_READS = 10;
  S.queue = [
    [{ ...targetProfile, id: TARGET }],                                  // own profile row
    [],                                                                  // photos
    [],                                                                  // own private location
    [],                                                                  // match ids
    [], [],                                                              // incoming/outgoing threads
    [{ count: 0 }], [{ count: 0 }],                                      // likes/matches counts
    [{ hideDistance: false, hideActiveStatus: false }],                  // display flags
    [],                                                                  // mixer city
  ];
  const { body } = await getProfile();
  assert.equal(body.profile.vault, null);
  assert.equal(S.reads, NON_VAULT_SELF_READS, 'self-read must consume exactly the non-vault reads and nothing more');
  assert.equal(S.queue.length, 0);
});

/* ---------- invariant V-2: the consent freeze is bidirectional ---------- */

await check('V-2 OUTBOUND: stale-consent target is invisible even on digest match', async () => {
  S.queue = [
    [vaultRow('2026-01-old', { vaccination_stance: 'vaccinated' })],      // target row: stale version
  ];
  const result = await visibility.getMutualVault(VIEWER, TARGET);
  assert.equal(result, null);
  assert.equal(S.reads, 1, 'freeze must short-circuit before any other read');
});

await check('V-2 INBOUND: stale-consent viewer is vault-blind even on digest match', async () => {
  S.queue = [
    [vaultRow(CURRENT, { vaccination_stance: 'vaccinated' })],            // target row: current
    [vaultRow('2026-01-old', { vaccination_stance: 'vaccinated' })],      // viewer row: stale
    digestRows({ viewer: ['vaccinated'], target: ['vaccinated'] }),       // digests WOULD match
  ];
  const result = await visibility.getMutualVault(VIEWER, TARGET);
  assert.equal(result, null, 'digests match but the stale viewer must be frozen');
});

await check('V-2: never-consenting viewer is vault-blind (no row at all)', async () => {
  S.queue = [
    [vaultRow(CURRENT, { vaccination_stance: 'vaccinated' })],            // target row
    [],                                                                   // viewer row: none
  ];
  const result = await visibility.getMutualVault(VIEWER, TARGET);
  assert.equal(result, null);
});

await check('V-2: re-consent (current version) restores BOTH directions', async () => {
  S.queue = [
    [vaultRow(CURRENT, { vaccination_stance: 'vaccinated' })],            // target re-accepted
    [vaultRow(CURRENT, { vaccination_stance: 'vaccinated' })],            // viewer re-accepted
    digestRows({ viewer: ['vaccinated'], target: ['vaccinated'] }),
  ];
  const result = await visibility.getMutualVault(VIEWER, TARGET);
  assert.deepEqual(result, { consentVersion: CURRENT, entries: { vaccination_stance: 'vaccinated' } });
});

await check('Undecryptable payload fails CLOSED: null, never partial or raw data', async () => {
  S.queue = [
    [{ consentVersion: CURRENT, payload: 'fbvault.v1.not-a-real-envelope' }],
    [vaultRow(CURRENT, {})],
    digestRows({ viewer: ['vaccinated'], target: ['vaccinated'] }),
  ];
  const result = await visibility.getMutualVault(VIEWER, TARGET);
  assert.equal(result, null);
});

/* ---------- /api/vault owner surface (rules 2 and 4) ---------- */

await check('Vault GET with no row: consent null, empty entries', async () => {
  S.queue = [[]];
  const res = await vaultRoutes.GET(new Request('http://local.test/api/vault'));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(body, { ok: true, consent: null, entries: {} });
});

await check('Vault GET returns the owner decrypted entries and consent state', async () => {
  S.queue = [[{ consentAcceptedAt: new Date(), consentVersion: CURRENT, payload: ENVELOPE({ vaccination_stance: 'unvaccinated' }) }]];
  const res = await vaultRoutes.GET(new Request('http://local.test/api/vault'));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.consent.current, true);
  assert.deepEqual(body.entries, { vaccination_stance: 'unvaccinated' });
});

await check('Vault POST without consent is 403 and writes NOTHING', async () => {
  S.queue = [[]];                                                        // no consent row
  const res = await vaultRoutes.POST(new Request('http://local.test/api/vault', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries: { vaccination_stance: 'vaccinated' } }),
  }));
  assert.equal(res.status, 403);
  assert.equal(S.mutations, 0, 'no consent → zero writes');
});

await check('Vault POST with invalid entries is 400 before any read or write', async () => {
  const res = await vaultRoutes.POST(new Request('http://local.test/api/vault', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries: { not_a_key: 'vaccinated' } }),
  }));
  assert.equal(res.status, 400);
  assert.equal(S.mutations, 0);
  assert.equal(S.reads, 0);
});

await check('Vault POST happy path re-encrypts and rewrites match keys in one transaction', async () => {
  S.queue = [
    [{ consentVersion: CURRENT }],                                       // consent row exists
    {},                                                                  // tx: update payload
    {},                                                                  // tx: delete old keys
    {},                                                                  // tx: insert new keys
  ];
  const res = await vaultRoutes.POST(new Request('http://local.test/api/vault', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries: { vaccination_stance: '  Vaccinated ' } }),
  }));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(body, { ok: true, consentCurrent: true });
  assert.equal(S.mutations, 1, 'exactly one transaction');
});

await check('Vault POST is refused cross-origin (403) before anything happens', async () => {
  const res = await vaultRoutes.POST(new Request('http://local.test/api/vault', {
    method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries: {} }),
  }));
  assert.equal(res.status, 403);
  assert.equal(S.mutations, 0);
});

await check('Vault DELETE hard-deletes everything and is idempotent', async () => {
  S.queue = [{}, {}];                                                    // tx: delete keys, delete entries
  const res = await vaultRoutes.DELETE(new Request('http://local.test/api/vault', { method: 'DELETE' }));
  assert.equal(res.status, 200);
  assert.equal(S.mutations, 1);
  S.queue = [{}, {}];                                                    // second DELETE finds nothing
  const res2 = await vaultRoutes.DELETE(new Request('http://local.test/api/vault', { method: 'DELETE' }));
  assert.equal(res2.status, 200);
  assert.equal(S.mutations, 2);
});

await check('Consent POST records acceptance; non-acceptance is 400 with zero writes', async () => {
  const bad = await consentRoutes.POST(new Request('http://local.test/api/vault/consent', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accepted: false }),
  }));
  assert.equal(bad.status, 400);
  assert.equal(S.mutations, 0);

  S.queue = [{}];                                                        // insert ... onConflictDoUpdate
  const res = await consentRoutes.POST(new Request('http://local.test/api/vault/consent', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accepted: true }),
  }));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.consentVersion, CURRENT);
  assert.equal(S.mutations, 1);
});

await check('Signed-out members are refused on every vault route', async () => {
  S.user = null;
  assert.equal((await vaultRoutes.GET(new Request('http://local.test/api/vault'))).status, 401);
  assert.equal((await vaultRoutes.POST(new Request('http://local.test/api/vault', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }))).status, 401);
  assert.equal((await vaultRoutes.DELETE(new Request('http://local.test/api/vault', { method: 'DELETE' }))).status, 401);
  assert.equal((await consentRoutes.POST(new Request('http://local.test/api/vault/consent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"accepted":true}' }))).status, 401);
});

await check('Auth resolver outage is 503, never a false 401 or silent success', async () => {
  S.memberError = true;
  assert.equal((await vaultRoutes.GET(new Request('http://local.test/api/vault'))).status, 503);
  assert.equal((await detail.GET(new Request(`http://local.test/api/profile/${TARGET}`), { params: Promise.resolve({ id: TARGET }) })).status, 503);
});

console.log(`\n${n} vault-visibility contract checks passed`);
