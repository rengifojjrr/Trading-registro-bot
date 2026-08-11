import { generateKeyPairSync } from "node:crypto";
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
});
