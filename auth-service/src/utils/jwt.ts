import { SignJWT, importPKCS8, importSPKI, exportJWK, JWTPayload, KeyLike, jwtVerify } from "jose";
import { env } from "../config/env";

let privateKeyPromise: Promise<KeyLike> | null = null;
let publicKeyPromise: Promise<KeyLike> | null = null;
let publicJWKPromise: Promise<JsonWebKey> | null = null;

function initKeys() {
  if (!privateKeyPromise) {
    privateKeyPromise = importPKCS8(env.AUTH_JWT_PRIVATE_KEY, "RS256");
  }
  if (!publicKeyPromise) {
    publicKeyPromise = importSPKI(env.AUTH_JWT_PUBLIC_KEY, "RS256");
  }
  if (!publicJWKPromise) {
    publicJWKPromise = (async () => {
      const pub = await publicKeyPromise!;
      const jwk = await exportJWK(pub);
      // add required fields
      jwk.alg = "RS256" as any;
      jwk.use = "sig" as any;
      jwk.kid = env.AUTH_JWT_KID as any;
      return jwk;
    })();
  }
}

initKeys();

export async function signAccessToken(subject: string, claims: Record<string, any>): Promise<string> {
  const key = await privateKeyPromise!;
  const jwt = await new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "RS256", kid: env.AUTH_JWT_KID })
    .setSubject(subject)
    .setIssuer(env.AUTH_JWT_ISSUER)
    .setAudience(env.AUTH_JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(env.AUTH_JWT_ACCESS_EXPIRES_IN)
    .sign(key);
  return jwt;
}

export async function getJWKS() {
  const jwk = await publicJWKPromise!;
  return { keys: [jwk] };
}

export async function verifyAccessToken(token: string): Promise<JWTPayload> {
  const key = await publicKeyPromise!;
  const { payload } = await jwtVerify(token, key, {
    issuer: env.AUTH_JWT_ISSUER,
    audience: env.AUTH_JWT_AUDIENCE,
    algorithms: ["RS256"],
  });
  return payload;
}
