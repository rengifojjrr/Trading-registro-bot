import { createPrivateKey, randomBytes, type KeyObject } from "node:crypto";
import { SignJWT } from "jose";

/**
 * Some CDP portal flows show an Ed25519 secret as a bare base64 string (the
 * "Secret API key details" -> "Save your API key" dialog) instead of a
 * PKCS8 PEM block. Confirmed by inspection: it decodes to either the raw
 * 32-byte seed, or 64 bytes (the NaCl/libsodium "secret key" convention --
 * the 32-byte seed followed by its 32-byte public key). Either way, only
 * the first 32 bytes (the seed) are needed to build a real Ed25519 key.
 *
 * PKCS8's DER encoding of an Ed25519 private key has no variable-length
 * fields besides the 32-byte seed itself (RFC 8410 s7), so this 16-byte
 * prefix is a fixed constant, not something derived per-key -- verified by
 * generating a fresh Ed25519 key with node:crypto and diffing its own
 * PKCS8 DER export against this exact prefix.
 */
const ED25519_PKCS8_DER_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const ED25519_SEED_LENGTH = 32;
const ED25519_LIBSODIUM_SECRET_KEY_LENGTH = 64;

function tryParseRawEd25519Base64(value: string): KeyObject | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;

  const raw = Buffer.from(value, "base64");
  // Buffer.from(..., "base64") silently drops invalid characters instead of
  // throwing -- re-encoding and comparing catches a false-positive match on
  // a string that only looks like base64.
  if (raw.toString("base64").replace(/=+$/, "") !== value.replace(/=+$/, "")) return null;

  let seed: Buffer;
  if (raw.length === ED25519_LIBSODIUM_SECRET_KEY_LENGTH) {
    seed = raw.subarray(0, ED25519_SEED_LENGTH);
  } else if (raw.length === ED25519_SEED_LENGTH) {
    seed = raw;
  } else {
    return null;
  }

  try {
    return createPrivateKey({
      key: Buffer.concat([ED25519_PKCS8_DER_PREFIX, seed]),
      format: "der",
      type: "pkcs8",
    });
  } catch {
    return null;
  }
}

/**
 * No `import "server-only"` here on purpose: this module is pure crypto
 * that takes a key as a parameter rather than reading one from
 * process.env, so it has no secret-leakage boundary of its own -- that
 * guard belongs at the call site that actually sources
 * COINBASE_CDP_PRIVATE_KEY from serverEnv() (Phase 2's lib/coinbase/client.ts),
 * and at lib/supabase/admin.ts / lib/env.ts's serverEnv(), which already
 * carry it. Keeping this file guard-free also lets it be unit tested
 * directly with Vitest, which doesn't run inside Next.js's RSC bundling
 * step where `server-only` enforces its check.
 *
 * Signs the short-lived JWTs Coinbase Developer Platform (CDP) requires on
 * every REST request. Confirmed against Coinbase's own docs and SDKs
 * (docs.cdp.coinbase.com auth guide + coinbase/coinbase-advanced-py's
 * jwt_generator) on 2026-08-11:
 *
 *   header:  { alg: "ES256" | "EdDSA", kid: <key name>, nonce: <random hex>, typ: "JWT" }
 *   payload: { sub: <key name>, iss: "cdp", nbf: now, exp: now + 120, uri: "<METHOD> <host><path>" }
 *   request: Authorization: Bearer <jwt>
 *
 * CDP issues either an Ed25519 key (PKCS8 PEM) or an ECDSA P-256 key (SEC1
 * PEM); the correct alg is auto-detected from the key material rather than
 * assumed, exactly like Coinbase's own SDKs do. Node's createPrivateKey
 * parses both PEM encodings natively, so there's no need for jose's
 * PKCS8-only importer here. The portal's "Secret API key" creation dialog
 * has also been observed showing an Ed25519 key as a bare base64 string
 * instead of PEM -- see tryParseRawEd25519Base64 below, tried first for
 * anything that isn't already a PEM block.
 *
 * This module signs tokens; it never makes an HTTP request itself (that's
 * lib/coinbase/client.ts, Phase 2). Signing is pure, deterministic-enough
 * logic given a key and a clock, so it's fully unit-testable with a
 * throwaway test key -- never a real Coinbase credential.
 */

const TOKEN_LIFETIME_SECONDS = 120;

export interface CdpJwtParams {
  keyName: string;
  privateKeyPem: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  host: string;
  path: string;
}

/**
 * Facts about a PEM string that are safe to surface in an error message or
 * UI -- every field here is a count or boolean, never a substring of the
 * key itself, so this can never leak key material even though it's derived
 * from a secret. Exists because "could not parse" alone isn't enough to
 * self-diagnose a bad paste (truncated copy, stray escaping, wrong field)
 * without either seeing the value or guessing blind.
 */
function describePemShape(raw: string): Record<string, number | boolean> {
  const trimmed = raw.trim();
  return {
    length: raw.length,
    lineCount: raw.split("\n").length,
    startsWithBeginMarker: trimmed.startsWith("-----BEGIN"),
    endsWithDashMarker: trimmed.endsWith("-----"),
    containsEndMarker: trimmed.includes("-----END"),
    containsLiteralEscapedNewline: raw.includes("\\n"),
  };
}

function loadSigningKey(privateKeyPem: string): { key: KeyObject; alg: "ES256" | "EdDSA" } {
  const trimmed = privateKeyPem.trim();
  if (!trimmed.startsWith("-----BEGIN")) {
    const rawKey = tryParseRawEd25519Base64(trimmed);
    if (rawKey) return { key: rawKey, alg: "EdDSA" };
  }

  let key: KeyObject;
  try {
    key = createPrivateKey(privateKeyPem);
  } catch (cause) {
    throw new Error(
      "Could not parse Coinbase CDP private key. Expected a PEM-encoded Ed25519 (PKCS8) or ECDSA P-256 (SEC1) private key. " +
        `Structural diagnostics (never includes key material): ${JSON.stringify(describePemShape(privateKeyPem))}.`,
      { cause },
    );
  }

  if (key.asymmetricKeyType === "ed25519") {
    return { key, alg: "EdDSA" };
  }
  if (key.asymmetricKeyType === "ec") {
    return { key, alg: "ES256" };
  }

  throw new Error(
    `Unsupported Coinbase CDP key type "${key.asymmetricKeyType}". Expected Ed25519 or ECDSA (P-256).`,
  );
}

export async function generateCdpJwt({
  keyName,
  privateKeyPem,
  method,
  host,
  path,
}: CdpJwtParams): Promise<string> {
  const { key, alg } = loadSigningKey(privateKeyPem);
  const uri = `${method} ${host}${path}`;
  const nonce = randomBytes(16).toString("hex");
  const nowSeconds = Math.floor(Date.now() / 1000);

  return new SignJWT({ uri })
    .setProtectedHeader({ alg, kid: keyName, nonce, typ: "JWT" })
    .setIssuer("cdp")
    .setSubject(keyName)
    .setNotBefore(nowSeconds)
    .setExpirationTime(nowSeconds + TOKEN_LIFETIME_SECONDS)
    .sign(key);
}
