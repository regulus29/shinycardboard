import { createHash, timingSafeEqual } from 'node:crypto';

const BEARER = /^Bearer\s+(\S+)$/i;

/** Constant-time string comparison. Hashing first makes both inputs the same length. */
export function safeEqual(a: string, b: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

export function bearerToken(authorizationHeader: string | undefined): string | undefined {
  return authorizationHeader ? BEARER.exec(authorizationHeader.trim())?.[1] : undefined;
}

export function isAuthorized(authorizationHeader: string | undefined, expectedToken: string): boolean {
  const presented = bearerToken(authorizationHeader);
  // Compare something even when no token was sent so timing does not reveal that.
  return safeEqual(presented ?? '', expectedToken) && presented !== undefined;
}
