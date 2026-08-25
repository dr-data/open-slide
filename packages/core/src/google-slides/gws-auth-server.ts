import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type GwsAuthStatus = {
  connected: boolean;
  account?: string;
  method?: 'gws';
  error?: string;
};

type OAuthUserCreds = {
  client_id?: string;
  client_secret?: string;
  refresh_token?: string;
  access_token?: string;
  token?: string;
};

function gwsConfigDir(): string {
  const override = process.env.GOOGLE_WORKSPACE_CLI_CONFIG_DIR?.trim();
  if (override) return override;
  return path.join(os.homedir(), '.config/gws');
}

async function readJsonFile(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function refreshOAuthToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token refresh failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('Google token refresh returned no access_token');
  return data.access_token;
}

async function tokenFromCredentialsFile(filePath: string): Promise<string | null> {
  const raw = await readJsonFile(filePath);
  if (!raw) return null;
  const creds = raw as OAuthUserCreds;

  const direct = creds.access_token ?? creds.token;
  if (typeof direct === 'string' && direct.length > 0) return direct;

  if (creds.client_id && creds.client_secret && creds.refresh_token) {
    return await refreshOAuthToken(creds.client_id, creds.client_secret, creds.refresh_token);
  }
  return null;
}

async function tokenFromCache(configDir: string): Promise<string | null> {
  const cache = await readJsonFile(path.join(configDir, 'token_cache.json'));
  if (!cache) return null;
  const accessToken = cache.access_token;
  const expiry = cache.expiry_date ?? cache.expires_at;
  if (typeof accessToken !== 'string') return null;
  if (typeof expiry === 'number' && Date.now() >= expiry - 60_000) return null;
  return accessToken;
}

export async function resolveGwsAccessToken(): Promise<string | null> {
  const envToken = process.env.GOOGLE_WORKSPACE_CLI_TOKEN?.trim();
  if (envToken) return envToken;

  const configDir = gwsConfigDir();
  const cached = await tokenFromCache(configDir);
  if (cached) return cached;

  const credsFile = process.env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE?.trim();
  if (credsFile) {
    const fromFile = await tokenFromCredentialsFile(credsFile);
    if (fromFile) return fromFile;
  }

  const defaultCreds = path.join(configDir, 'credentials.json');
  const fromDefault = await tokenFromCredentialsFile(defaultCreds);
  if (fromDefault) return fromDefault;

  return null;
}

async function readGwsAccount(): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('gws', ['auth', 'status', '--json'], {
      timeout: 15_000,
      env: process.env,
    });
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    const account = parsed.account ?? parsed.email ?? parsed.user;
    return typeof account === 'string' ? account : undefined;
  } catch {
    return undefined;
  }
}

export async function getGwsAuthStatus(): Promise<GwsAuthStatus> {
  try {
    const token = await resolveGwsAccessToken();
    if (!token) {
      return {
        connected: false,
        error: 'No gws credentials. Run: gws auth login -s slides,drive',
      };
    }
    const account = await readGwsAccount();
    return { connected: true, account, method: 'gws' };
  } catch (err) {
    return {
      connected: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function requireGwsAccessToken(): Promise<string> {
  const token = await resolveGwsAccessToken();
  if (!token) {
    throw new Error(
      'Google auth not available. Run `gws auth login -s slides,drive` in your terminal, then retry.',
    );
  }
  return token;
}
