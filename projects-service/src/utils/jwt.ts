import { createRemoteJWKSet, jwtVerify, JWTPayload } from "jose";
import { env } from "../config/env";

const JWKS = createRemoteJWKSet(new URL(env.AUTH_JWKS_URL));

export type AccessTokenPayload = JWTPayload & {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
  displayName?: string;
  avatarUrl?: string;
  roles?: string[];
  tv?: number;
};

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: env.AUTH_JWT_ISSUER,
    audience: env.AUTH_JWT_AUDIENCE,
  });
  return payload as AccessTokenPayload;
}
