import { fetchGwsAuthStatus } from './google-slides-api';

export async function isGoogleConnected(): Promise<boolean> {
  const status = await fetchGwsAuthStatus();
  return status.connected;
}

export async function getGoogleAuthStatus() {
  return fetchGwsAuthStatus();
}

export async function ensureGoogleConnected(): Promise<void> {
  const status = await fetchGwsAuthStatus();
  if (!status.connected) {
    throw new Error(status.error ?? 'Run gws auth login -s slides,drive');
  }
}
