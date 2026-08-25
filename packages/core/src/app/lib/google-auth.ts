import { clearGoogleAuth, readGoogleAuth, writeGoogleAuth } from '../../google-slides/auth-store';
import { GOOGLE_DRIVE_FILE_SCOPE, GOOGLE_SLIDES_SCOPE } from '../../google-slides/constants';

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: {
            client_id: string;
            scope: string;
            callback: (res: { access_token?: string; expires_in?: number; error?: string }) => void;
          }) => { requestAccessToken: () => void };
        };
      };
    };
  }
}

export function isGoogleConnected(): boolean {
  return readGoogleAuth() !== null;
}

export function disconnectGoogle(): void {
  clearGoogleAuth();
}

export async function loadGoogleIdentityScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
}

export async function connectGoogle(clientId: string): Promise<void> {
  await loadGoogleIdentityScript();
  await new Promise<void>((resolve, reject) => {
    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) {
      reject(new Error('Google Identity Services failed to initialize'));
      return;
    }
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: `${GOOGLE_SLIDES_SCOPE} ${GOOGLE_DRIVE_FILE_SCOPE}`,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error ?? 'Google sign-in failed'));
          return;
        }
        writeGoogleAuth({
          accessToken: response.access_token,
          expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
        });
        resolve();
      },
    });
    client.requestAccessToken();
  });
}
