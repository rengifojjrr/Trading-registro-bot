import { createPrivateKey, randomBytes, type KeyObject } from "node:crypto";
import { SignJWT } from "jose";

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
 * PKCS8-only importer here.
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
