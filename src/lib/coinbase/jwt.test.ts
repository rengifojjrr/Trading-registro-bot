import { createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto";
import { jwtVerify, importSPKI } from "jose";
import { describe, expect, it } from "vitest";

import { generateCdpJwt } from "./jwt";

/**
 * Every key in this file is generated fresh at test time -- never a real
 * Coinbase credential, never committed key material.
 */

function generateEcTestKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
    privateKeyEncoding: { type: "sec1", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  return { privateKeyPem: privateKey as string, publicKeyPem: publicKey as string };
}

function generateEd25519TestKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  return { privateKeyPem: privateKey as string, publicKeyPem: publicKey as string };
}

/**
 * PKCS8 DER for Ed25519 is a fixed 16-byte prefix + the raw 32-byte seed
 * (RFC 8410 s7) -- extracting the last 32 bytes of the DER export recovers
 * exactly the seed a "bare base64" CDP portal export would contain.
 */
function extractRawEd25519Seed(privateKeyPem: string): Buffer {
  const der = createPrivateKey(privateKeyPem).export({ format: "der", type: "pkcs8" });
  return der.subarray(der.length - 32);
}

function extractRawEd25519PublicKey(publicKeyPem: string): Buffer {
  const der = createPublicKey(publicKeyPem).export({ format: "der", type: "spki" });
  return der.subarray(der.length - 32);
}

describe("generateCdpJwt", () => {
  it("signs a verifiable ES256 token for a SEC1 EC key and sets the expected claims", async () => {
    const { privateKeyPem, publicKeyPem } = generateEcTestKeyPair();

    const token = await generateCdpJwt({
      keyName: "organizations/test-org/apiKeys/test-key",
      privateKeyPem,
      method: "GET",
      host: "api.coinbase.com",
      path: "/api/v3/brokerage/orders/historical/fills",
    });

    const publicKey = await importSPKI(publicKeyPem, "ES256");
    const { payload, protectedHeader } = await jwtVerify(token, publicKey);

    expect(protectedHeader.alg).toBe("ES256");
    expect(protectedHeader.kid).toBe("organizations/test-org/apiKeys/test-key");
    expect(protectedHeader.nonce).toEqual(expect.any(String));
    expect(payload.iss).toBe("cdp");
    expect(payload.sub).toBe("organizations/test-org/apiKeys/test-key");
    expect(payload.uri).toBe(
      "GET api.coinbase.com/api/v3/brokerage/orders/historical/fills",
    );
    expect(typeof payload.nbf).toBe("number");
    expect(typeof payload.exp).toBe("number");
    expect(payload.exp! - payload.nbf!).toBe(120);
  });

  it("signs a verifiable EdDSA token for a PKCS8 Ed25519 key", async () => {
    const { privateKeyPem, publicKeyPem } = generateEd25519TestKeyPair();

    const token = await generateCdpJwt({
      keyName: "organizations/test-org/apiKeys/ed25519-key",
      privateKeyPem,
      method: "GET",
      host: "api.coinbase.com",
      path: "/api/v3/brokerage/products",
    });

    const publicKey = await importSPKI(publicKeyPem, "EdDSA");
    const { protectedHeader } = await jwtVerify(token, publicKey);

    expect(protectedHeader.alg).toBe("EdDSA");
  });

  it("signs a verifiable EdDSA token from a bare base64 32-byte Ed25519 seed (no PEM wrapper)", async () => {
    const { privateKeyPem, publicKeyPem } = generateEd25519TestKeyPair();
    const seedBase64 = extractRawEd25519Seed(privateKeyPem).toString("base64");

    const token = await generateCdpJwt({
      keyName: "organizations/test-org/apiKeys/ed25519-raw-seed",
      privateKeyPem: seedBase64,
      method: "GET",
      host: "api.coinbase.com",
      path: "/api/v3/brokerage/products",
    });

    const publicKey = await importSPKI(publicKeyPem, "EdDSA");
    const { protectedHeader } = await jwtVerify(token, publicKey);
    expect(protectedHeader.alg).toBe("EdDSA");
  });

  it("signs a verifiable EdDSA token from a 64-byte base64 secret (NaCl/libsodium seed+pubkey convention)", async () => {
    const { privateKeyPem, publicKeyPem } = generateEd25519TestKeyPair();
    const seed = extractRawEd25519Seed(privateKeyPem);
    const rawPublicKey = extractRawEd25519PublicKey(publicKeyPem);
    const libsodiumSecretKey = Buffer.concat([seed, rawPublicKey]).toString("base64");
    expect(Buffer.from(libsodiumSecretKey, "base64")).toHaveLength(64);

    const token = await generateCdpJwt({
      keyName: "organizations/test-org/apiKeys/ed25519-libsodium",
      privateKeyPem: libsodiumSecretKey,
      method: "GET",
      host: "api.coinbase.com",
      path: "/api/v3/brokerage/products",
    });

    const publicKey = await importSPKI(publicKeyPem, "EdDSA");
    const { protectedHeader } = await jwtVerify(token, publicKey);
    expect(protectedHeader.alg).toBe("EdDSA");
  });

  it("does not misparse arbitrary short base64-looking garbage as a raw Ed25519 key", async () => {
    // Valid base64 alphabet, but neither 32 nor 64 decoded bytes -- must
    // fall through to the normal PEM error path, not silently produce a
    // bogus key.
    await expect(
      generateCdpJwt({
        keyName: "k",
        privateKeyPem: Buffer.from("too-short-to-be-a-key").toString("base64"),
        method: "GET",
        host: "api.coinbase.com",
        path: "/api/v3/brokerage/accounts",
      }),
    ).rejects.toThrow(/Could not parse Coinbase CDP private key/);
  });

  it("produces a different nonce on every call", async () => {
    const { privateKeyPem } = generateEcTestKeyPair();
    const params = {
      keyName: "k",
      privateKeyPem,
      method: "GET" as const,
      host: "api.coinbase.com",
      path: "/api/v3/brokerage/accounts",
    };

    const [tokenA, tokenB] = await Promise.all([
      generateCdpJwt(params),
      generateCdpJwt(params),
    ]);

    expect(tokenA).not.toBe(tokenB);
  });

  it("rejects key material that isn't a valid PEM private key", async () => {
    await expect(
      generateCdpJwt({
        keyName: "k",
        privateKeyPem: "not-a-real-key",
        method: "GET",
        host: "api.coinbase.com",
        path: "/api/v3/brokerage/accounts",
      }),
    ).rejects.toThrow(/Could not parse Coinbase CDP private key/);
  });

  it("includes safe, non-secret structural diagnostics on a parse failure -- never the key material itself", async () => {
    try {
      await generateCdpJwt({
        keyName: "k",
        privateKeyPem: "not-a-real-key",
        method: "GET",
        host: "api.coinbase.com",
        path: "/api/v3/brokerage/accounts",
      });
      expect.unreachable("expected generateCdpJwt to throw");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('"length":14');
      expect(message).toContain('"lineCount":1');
      expect(message).toContain('"startsWithBeginMarker":false');
      expect(message).toContain('"endsWithDashMarker":false');
      expect(message).toContain('"containsEndMarker":false');
      expect(message).toContain('"containsLiteralEscapedNewline":false');
      expect(message).not.toContain("not-a-real-key");
    }
  });
});
