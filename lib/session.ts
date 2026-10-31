import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'crypto';
import { DEMO } from './store';

const COOKIE = 'cb_session';
const MAX_AGE = 30 * 24 * 60 * 60; // 30 days

function secret(): string {
  const s = process.env.SESSION_SECRET || (DEMO ? 'demo-mode-secret-not-for-production' : undefined);
  if (!s || s.length < 16) throw new Error('SESSION_SECRET env var is missing (use 32+ random characters).');
  return s;
}

function sign(value: string): string {
  return createHmac('sha256', secret()).update(value).digest('base64url');
}

export async function setSession(memberId: string) {
  const value = `${memberId}.${Date.now() + MAX_AGE * 1000}`;
  (await cookies()).set(COOKIE, `${value}.${sign(value)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

/** Returns the signed-in member id, or null if the cookie is missing, forged or expired. */
export async function getSessionMemberId(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const cut = raw.lastIndexOf('.');
  if (cut < 0) return null;
  const value = raw.slice(0, cut);
  const sig = Buffer.from(raw.slice(cut + 1));
  const expected = Buffer.from(sign(value));
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;
  const [id, exp] = value.split('.');
  if (!id || Number(exp) < Date.now()) return null;
  return id;
}
