import type { GoogleAuthState } from './types';

const AUTH_KEY = 'open-slide.google-auth';
const SYNC_KEY_PREFIX = 'open-slide.google-sync:';

export function readGoogleAuth(): GoogleAuthState | null {
  try {
    const raw = sessionStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GoogleAuthState;
    if (!parsed.accessToken || !parsed.expiresAt) return null;
    if (Date.now() >= parsed.expiresAt - 60_000) {
      sessionStorage.removeItem(AUTH_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeGoogleAuth(state: GoogleAuthState): void {
  sessionStorage.setItem(AUTH_KEY, JSON.stringify(state));
}

export function clearGoogleAuth(): void {
  sessionStorage.removeItem(AUTH_KEY);
}

export function readSyncMeta(slideId: string): import('./types').GoogleSlidesSyncMeta | null {
  try {
    const raw = localStorage.getItem(`${SYNC_KEY_PREFIX}${slideId}`);
    if (!raw) return null;
    return JSON.parse(raw) as import('./types').GoogleSlidesSyncMeta;
  } catch {
    return null;
  }
}

export function writeSyncMeta(slideId: string, meta: import('./types').GoogleSlidesSyncMeta): void {
  localStorage.setItem(`${SYNC_KEY_PREFIX}${slideId}`, JSON.stringify(meta));
}

export async function googleFetch<T>(
  url: string,
  accessToken: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}
